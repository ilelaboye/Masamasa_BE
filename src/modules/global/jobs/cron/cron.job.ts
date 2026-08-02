import {
  axiosClient,
  transferWithFlutterWave,
  verifyTransfer,
} from "@/core/utils";
import { AdministratorService } from "@/modules/administrator/services/administrator.service";
import {
  PurchaseRequest,
  PurchaseStatus,
} from "@/modules/purchases/entities/purchases.entity";
import { ProviderService } from "@/modules/purchases/services/providers.service";
import {
  TransactionEntityType,
  TransactionModeType,
  Transactions,
  TransactionStatusType,
} from "@/modules/transactions/transactions.entity";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import {
  AccessToken,
  AccessTokenType,
} from "../../bank-verification/entities/access-token.entity";
import { appConfig } from "@/config";
import { UsersService } from "@/modules/users/services/users.service";
import { generateMasamasaRef } from "@/core/helpers";
import { TransactionService } from "@/modules/transactions/transactions.service";
import { User } from "@/modules/users/entities/user.entity";

@Injectable()
export class CronJob {
  constructor(
    @InjectRepository(Transactions)
    private readonly transactionsRepository: Repository<Transactions>,
    @InjectRepository(PurchaseRequest)
    private readonly purchaseRequestRepository: Repository<PurchaseRequest>,
    @InjectRepository(AccessToken)
    private readonly accessTokenRepository: Repository<AccessToken>,
    // private readonly adminService: AdministratorService,
    private readonly providerService: ProviderService,
    private readonly transactionsService: TransactionService,
    // private readonly usersService: UsersService
    private readonly dataSource: DataSource,
  ) {}

  // Handles all notification jobs
  async processPaymentJob() {
    console.log("START PROCESSING");
    const transactions = await this.transactionsRepository
      .createQueryBuilder("trans")
      .where("trans.status = :status", {
        status: TransactionStatusType.processing,
      })
      .andWhere("trans.entity_type = :type", {
        type: TransactionEntityType.withdrawal,
      })
      .andWhere("trans.retry = :retry", { retry: 0 })
      .getMany();

    var accessToken = await this.accessTokenRepository.findOne({
      where: { type: AccessTokenType.nomba },
    });

    if (!accessToken) {
      accessToken = await this.generateNombaAccessToken();
    }

    for (const trans of transactions) {
      const balance = await this.transactionsService.getAccountBalance(
        trans.user_id,
      );
      if (balance < trans.amount) {
        await this.transactionsRepository.update(
          { id: trans.id },
          {
            status: TransactionStatusType.failed,
            metadata: {
              error: "Insufficient wallet balance",
              ...trans.metadata,
            },
          },
        );
        continue;
      }
      try {
        const res = await axiosClient(
          `${appConfig.NOMBA_BASE_URL}/v1/transfers/bank`,
          {
            method: "POST",
            body: {
              accountNumber: trans.metadata.accountNumber,
              bankCode: trans.metadata.bankCode,
              amount: trans.amount,
              accountName: trans.metadata.accountName,
              merchantTxRef: trans.masamasa_ref,
              senderName: "MasaMasa",
              narration: trans.metadata.narration,
            },
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              accountId: appConfig.NOMBA_ACCOUNT_ID,
              Authorization: `Bearer ${accessToken!.token}`,
            },
          },
        );

        console.log("Nomba bank transfer", res.data);
        if (res.data.status == "SUCCESS") {
          console.log("Nomba transfer initiated successfully");
          await this.transactionsRepository.update(
            { id: trans.id },
            {
              status: TransactionStatusType.pending,
              retry: trans.retry + 1,
              session_id: res.data.id,
              metadata: {
                ...trans.metadata,
                error: null,
                initiate_resp: res.data,
              },
            },
          );
        } else {
          await this.transactionsRepository.update(
            { id: trans.id },
            {
              status: TransactionStatusType.failed,
              retry: trans.retry + 1,
              metadata: {
                ...trans.metadata,
                error: res.data,
                initiate_resp: res.data,
              },
            },
          );
        }
        return {
          message: "Account number verified",
          data: {
            bank_name: trans.metadata.bankName,
            account_name: res.data.accountName,
            account_number: trans.metadata.accountNumber,
          },
        };
      } catch (e) {
        console.log("Error from Nomba Transfer:", e.response);
        // // this.monitorService.recordError(e);

        // throw new BadRequestException(e.response.data.description);
      }
      // // pay with flutterwave
      // try {
      //   const resp = await transferWithFlutterWave({
      //     amount: trans.amount,
      //     bankCode: trans.metadata.bankCode,
      //     accountNumber: trans.metadata.accountNumber,
      //     ref: trans.masamasa_ref,
      //     narration: "Transfer from Masamasa",
      //   });
      //   console.log("resp from transfer", resp);
      //   if (resp.status) {
      // await this.transactionsRepository.update(
      //   { id: trans.id },
      //   {
      //     status: TransactionStatusType.pending,
      //     retry: trans.retry + 1,
      //     session_id: resp.data.data.id,
      //     metadata: {
      //       ...trans.metadata,
      //       error: null,
      //       initiate_resp: resp.data,
      //     },
      //   }
      // );
      //   } else {
      //     await this.transactionsRepository.update(
      //       { id: trans.id },
      //       {
      //         status: TransactionStatusType.failed,
      //         metadata: {
      //           ...trans.metadata,
      //           error: resp.message,
      //         },
      //       }
      //     );
      //     console.log("eerrr", resp.data);
      //   }
      // } catch (e) {
      //   console.log("eerrr eee", e);
      // }
    }
  }

  // A withdrawal is re-initiated at most this many times before being parked
  // for manual review.
  private static readonly MAX_WITHDRAWAL_RETRIES = 3;

  async verifyTransactionJob() {
    console.log("START VERIFYING MASAMASA TRANSACTION");
    const transactions = await this.transactionsRepository
      .createQueryBuilder("trans")
      .where("trans.status = :status", {
        status: TransactionStatusType.processing,
      })
      .andWhere("trans.entity_type = :type", {
        type: TransactionEntityType.withdrawal,
      })
      .getMany();

    if (transactions.length === 0) return;

    let accessToken = await this.accessTokenRepository.findOne({
      where: { type: AccessTokenType.nomba },
    });
    if (!accessToken) {
      accessToken = await this.generateNombaAccessToken();
    }
    if (!accessToken?.token) {
      console.log(
        "No Nomba access token available — skipping verification run",
        "VerifyTransactionJob",
      );
      return;
    }

    for (const trans of transactions) {
      console.log(
        "Verifying transaction with masamasa ref - ",
        trans.masamasa_ref,
      );
      // One bad transaction must never abort the rest of the run.
      try {
        const res = await axiosClient(
          `${appConfig.NOMBA_BASE_URL}/v1/transactions/accounts/single?merchantTxRef=${trans.masamasa_ref}`,
          {
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              accountId: appConfig.NOMBA_ACCOUNT_ID,
              Authorization: `Bearer ${accessToken.token}`,
            },
            timeout: 15000,
          },
        );
        console.log("Nomba bank verify transfer", res.data);
        if (res.data.status == "SUCCESS") {
          await this.transactionsRepository.update(
            { id: trans.id },
            {
              status: TransactionStatusType.success,
              metadata: { ...trans.metadata, nomba_resp: res.data },
            },
          );
        } else if (res.data.status == "PAYMENT_FAILED") {
          await this.transactionsRepository.update(
            { id: trans.id },
            {
              status: TransactionStatusType.failed,
              metadata: {
                ...trans.metadata,
                error: res.data.description,
                failed_resp: res.data,
              },
            },
          );
        }
      } catch (e) {
        const errData = e?.response?.data;
        console.log("Error from Nomba verify Transfer:", errData ?? e?.message);

        if (errData?.code == "404") {
          // Transaction unknown to Nomba — re-initiate it. Safe because
          // Nomba hard-rejects a duplicate merchantTxRef.
          try {
            await this.retryWithdrawal(trans, accessToken.token);
          } catch (retryErr) {
            console.log(
              `Retry failed for ${trans.masamasa_ref}: ${retryErr?.response?.data?.description ?? retryErr?.message}`,
              "VerifyTransactionJob",
            );
          }
        } else if (errData?.code == "400" || errData?.code == "401") {
          await this.transactionsRepository.update(
            { id: trans.id },
            {
              status: TransactionStatusType.failed,
              metadata: {
                ...trans.metadata,
                error: errData.description,
                failed_resp: errData,
              },
            },
          );
        } else {
          // Network-level failure or unexpected error shape — leave the
          // transaction processing; the next run re-verifies it.
          console.log(
            `Could not verify ${trans.masamasa_ref}: ${e?.message}`,
            "VerifyTransactionJob",
          );
        }
      }
      // try {
      //   const resp = await verifyTransfer({ id: trans.session_id });
      //   console.log("resp", resp);
      //   if (resp.status) {
      //     await this.transactionsRepository.update(
      //       { id: trans.id },
      //       {
      //         status: TransactionStatusType.success,
      //         session_id: resp.data.id,
      //         metadata: {
      //           ...trans.metadata,
      //           flutterwave_resp: resp.data,
      //           error: null,
      //         },
      //       }
      //     );
      //   } else {
      // await this.transactionsRepository.update(
      //   { id: trans.id },
      //   {
      //     metadata: {
      //       ...trans.metadata,
      //       error: resp.message,
      //       failed_resp: resp.data,
      //     },
      //   },
      // );
      //     console.log("eerrr", resp.data);
      //   }
      // } catch (e) {
      //   console.log("eerrr eee", e);
      // }
    }
  }

  /**
   * Re-initiates a withdrawal that Nomba has no record of. All DB work
   * (row lock, status re-check, balance check, retry claim) is committed
   * BEFORE the Nomba call — an external HTTP request must never run inside
   * an open transaction holding the user's row lock.
   */
  private async retryWithdrawal(trans: Transactions, token: string) {
    // Retry cap: after MAX_WITHDRAWAL_RETRIES attempts, park the withdrawal
    // for manual review instead of re-initiating forever.
    if (trans.retry >= CronJob.MAX_WITHDRAWAL_RETRIES) {
      if (!trans.metadata?.needs_review) {
        await this.transactionsRepository.update(
          { id: trans.id },
          {
            metadata: {
              ...trans.metadata,
              needs_review: true,
              note: "Retry cap reached — manual review required",
            },
          },
        );
      }
      console.log(
        `Withdrawal ${trans.masamasa_ref} hit the retry cap (${trans.retry}) — flagged for manual review`,
        "VerifyTransactionJob",
      );
      return;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let claimed = false;
    try {
      await queryRunner.manager
        .createQueryBuilder(User, "user")
        .setLock("pessimistic_write")
        .where("user.id = :id", { id: trans.user_id })
        .getOne();

      // Re-read under the lock: a webhook (or a concurrent run) may have
      // resolved or already retried this withdrawal since we fetched it.
      const fresh = await queryRunner.manager.findOne(Transactions, {
        where: { id: trans.id },
      });
      if (
        !fresh ||
        fresh.status !== TransactionStatusType.processing ||
        fresh.retry !== trans.retry
      ) {
        await queryRunner.commitTransaction();
        return;
      }

      // Balance check. This withdrawal is already reserved as a processing
      // debit, so exclude it from the sum — otherwise its own amount would
      // be counted twice and legitimate retries would be blocked.
      const balanceResult = await queryRunner.manager
        .createQueryBuilder(Transactions, "transaction")
        .select(
          `
              SUM(CASE WHEN transaction.mode = :credit AND transaction.status = :success THEN transaction.amount ELSE 0 END) -
              SUM(CASE WHEN transaction.mode = :debit AND transaction.status IN (:success, :processing) THEN transaction.amount ELSE 0 END)
            `,
          "balance",
        )
        .where("transaction.user_id = :user_id", {
          user_id: trans.user_id,
        })
        .andWhere("transaction.id != :transId", { transId: trans.id })
        .setParameters({
          credit: TransactionModeType.credit,
          debit: TransactionModeType.debit,
          success: TransactionStatusType.success,
          processing: TransactionStatusType.processing,
        })
        .getRawOne();

      const balance = parseFloat(balanceResult.balance) || 0;
      if (balance < trans.amount) {
        // Skip quietly — throwing here would only abort the caller's run.
        console.log(
          `Skipping retry for ${trans.masamasa_ref} — insufficient balance (${balance} < ${trans.amount})`,
          "VerifyTransactionJob",
        );
        await queryRunner.commitTransaction();
        return;
      }

      // Claim this attempt before calling Nomba so a concurrent run (the
      // fresh.retry check above) cannot re-initiate the same attempt.
      await queryRunner.manager.update(
        Transactions,
        { id: trans.id },
        { retry: trans.retry + 1 },
      );
      claimed = true;

      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }

    if (!claimed) return;

    // DB state is committed — now (and only now) call Nomba. Re-initiating
    // with the same merchantTxRef is safe: Nomba hard-rejects duplicates.
    const res = await axiosClient(
      `${appConfig.NOMBA_BASE_URL}/v1/transfers/bank`,
      {
        method: "POST",
        body: {
          accountNumber: trans.metadata.accountNumber,
          bankCode: trans.metadata.bankCode,
          amount: trans.amount,
          accountName: trans.metadata.accountName,
          merchantTxRef: trans.masamasa_ref,
          senderName: "MasaMasa",
          narration: "MasaMasa Transfer",
        },
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          accountId: appConfig.NOMBA_ACCOUNT_ID,
          Authorization: `Bearer ${token}`,
        },
        timeout: 15000,
      },
    );

    console.log("Nomba bank transfer", res.data);
    if (res.data.status == "SUCCESS") {
      console.log("Nomba transfer initiated successfully");
      await this.transactionsRepository.update(
        { id: trans.id },
        { session_id: res.data.id },
      );
    } else {
      // NOT marked failed: a non-SUCCESS response here can also mean Nomba
      // rejected the duplicate ref (i.e. the original transfer exists after
      // all). Leave it processing — the next verify run resolves the real
      // state, and the retry cap bounds how often this path repeats.
      await this.transactionsRepository.update(
        { id: trans.id },
        {
          metadata: {
            ...trans.metadata,
            initiate_resp: res.data,
          },
        },
      );
      console.log(
        `Re-initiation for ${trans.masamasa_ref} not accepted — left processing for next verification run`,
        "VerifyTransactionJob",
      );
    }
  }

  async verifyProcessingVtpassTransactions() {
    console.log("START VERIFYING VTPASS TRANSACTION");
    const purchases = await this.purchaseRequestRepository
      .createQueryBuilder("purchase")
      .where("purchase.status = :status", {
        status: PurchaseStatus.processing,
      })
      .getMany();

    for (const purchase of purchases) {
      // Logic to verify VTPass transaction
      const verify = await this.providerService.verifyVtpassTransaction(
        purchase.masamasa_ref,
      );
      console.log("verify vtpass", verify);
      if (verify.status) {
        if (
          verify.body.content &&
          verify.body.content.transactions &&
          verify.body.content.transactions.status == "delivered"
        ) {
          this.purchaseRequestRepository.update(
            { id: purchase.id },
            {
              status: PurchaseStatus.processed,
              commission: verify.body.content.transactions.commission,
              other_ref: verify.body.content.transactions.transactionId,
              metadata: {
                ...purchase.metadata,
                provider_response: verify.body,
              },
            },
          );
        } else if (
          verify.body.content &&
          verify.body.content.transactions &&
          verify.body.content.transactions.status == "pending"
        ) {
          this.purchaseRequestRepository.update(
            { id: purchase.id },
            {
              metadata: {
                error: "Transaction processing",
                ...purchase.metadata,
                provider_response: verify.body,
              },
            },
          );
        }
      }
    }
  }

  async generateNombaAccessToken() {
    console.log("START GENERATING NOMBA ACCESS TOKEN");

    try {
      const res = await axiosClient(
        `${appConfig.NOMBA_BASE_URL}/v1/auth/token/issue`,
        {
          method: "POST",
          body: {
            grant_type: "client_credentials",
            client_id: appConfig.NOMBA_CLIENT_ID,
            client_secret: appConfig.NOMBA_PRIVATE_KEY,
          },
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            accountId: appConfig.NOMBA_ACCOUNT_ID,
          },
        },
      );
      console.log("Nomba access token response", res);
      if (res.data) {
        await this.accessTokenRepository
          .createQueryBuilder("access_token")
          .delete()
          .where("type = :type", { type: AccessTokenType.nomba })
          .execute();

        await this.accessTokenRepository.save({
          type: AccessTokenType.nomba,
          token: res.data.access_token,
          refresh_token: res.data.refresh_token,
          metadata: res.data,
          created_at: new Date(),
        });
        console.log("NOMBA ACCESS TOKEN GENERATED SUCCESSFULLY");
        return res.data;
      }
    } catch (e) {
      console.log("Error generating Nomba access token:", e);
      // // this.monitorService.recordError(e);
      throw new BadRequestException(e.message);
    }
  }
}
