import {
  axiosClient,
  sendLowBalanceAlertEmail,
  sendWithdrawalSuccessEmail,
  transferWithFlutterWave,
  verifyTransfer,
} from "@/core/utils";
import { AdministratorService } from "@/modules/administrator/services/administrator.service";
import {
  PurchaseRequest,
  PurchaseStatus,
  PurchaseType,
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
import { MixpanelService } from "@/modules/global/mixpanel/mixpanel.service";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import { NotificationTag } from "@/modules/notifications/entities/notification.entity";

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
    private readonly mixpanel: MixpanelService,
    private readonly notificationsService: NotificationsService,
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
      } catch (e: any) {
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
  private static readonly MAX_WITHDRAWAL_RETRIES = 10;

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
          // The webhook usually settles these first; only notify when this
          // run is the one that flips the status, never twice.
          const settledHere = trans.status !== TransactionStatusType.success;

          await this.transactionsRepository.update(
            { id: trans.id },
            {
              status: TransactionStatusType.success,
              metadata: { ...trans.metadata, nomba_resp: res.data },
            },
          );

          if (settledHere) {
            await this.notifyWithdrawalSuccess(trans);
          }
          this.mixpanel.track("payout completed", trans.user_id, {
            "payout id": trans.masamasa_ref,
            "amount ngn": Number(trans.amount) || 0,
            "bank code": trans.metadata?.bankCode,
            "time to payout seconds": Math.round(
              (Date.now() - new Date(trans.created_at).getTime()) / 1000,
            ),
          });
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
          this.mixpanel.track("payout failed", trans.user_id, {
            "payout id": trans.masamasa_ref,
            "amount ngn": Number(trans.amount) || 0,
            "bank code": trans.metadata?.bankCode,
            "failure reason code": "PAYMENT_FAILED",
          });
        }
      } catch (e: any) {
        const errData = e?.response?.data;
        console.log(
          "Error from Nomba verify Transfer:",
          errData ?? e?.description,
        );

        if (errData?.code == "404") {
          // Transaction unknown to Nomba — re-initiate it. Safe because
          // Nomba hard-rejects a duplicate merchantTxRef.
          try {
            await this.retryWithdrawal(trans, accessToken.token);
          } catch (retryErr: any) {
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
    }
  }

  /**
   * Re-initiates a withdrawal that Nomba has no record of. All DB work
   * (row lock, status re-check, balance check, retry claim) is committed
   * BEFORE the Nomba call — an external HTTP request must never run inside
   * an open transaction holding the user's row lock.
   */
  /**
   * Emails + in-app notifies the user that their withdrawal was paid out.
   * Never allowed to break the cron run.
   */
  private async notifyWithdrawalSuccess(trans: Transactions) {
    try {
      const user = await this.dataSource
        .getRepository(User)
        .findOne({ where: { id: trans.user_id } });
      if (!user) return;

      sendWithdrawalSuccessEmail(user, {
        amount: Number(trans.amount) || 0,
        bankName: trans.metadata?.bankName,
        accountNumber: trans.metadata?.accountNumber,
        reference: trans.masamasa_ref,
      });

      await this.notificationsService.create({
        userId: trans.user_id,
        message: `Your withdrawal of NGN ${Number(trans.amount ?? 0).toLocaleString("en-NG")} was successful`,
        tag: NotificationTag.withdrawal,
        pushTitle: "Withdrawal Successful",
        metadata: { reference: trans.masamasa_ref },
      });
    } catch (err: any) {
      console.log(
        `Withdrawal notification failed for ${trans.masamasa_ref}:`,
        err?.message,
      );
    }
  }

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
    // console.log("START VERIFYING VTPASS TRANSACTION");
    const purchases = await this.purchaseRequestRepository
      .createQueryBuilder("purchase")
      .where("purchase.status = :status", {
        status: PurchaseStatus.processing,
      })
      .getMany();

    for (const purchase of purchases) {
      // Purchases parked because OUR VTPass balance was low were never
      // created at VTPass — re-initiate them instead of verifying.
      if (purchase.metadata?.needs_initiation) {
        try {
          await this.retryPurchaseInitiation(purchase);
        } catch (e: any) {
          console.log(
            `Purchase retry failed for ${purchase.masamasa_ref}:`,
            e?.response?.data ?? e?.message,
          );
        }
        continue;
      }

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
          await this.purchaseRequestRepository.update(
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
          // The create flow only debits the wallet when VTPass delivers
          // immediately — purchases that delivered later via this
          // verification must be debited here.
          await this.ensurePurchaseDebit(purchase, verify.body);
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

  // A parked purchase is re-initiated at most this many times before being
  // marked failed (the user was never charged, so failing is safe).
  private static readonly MAX_PURCHASE_RETRIES = 3;

  private purchaseEntityType(type: PurchaseType): TransactionEntityType {
    switch (type) {
      case PurchaseType.airtime:
        return TransactionEntityType.airtime;
      case PurchaseType.data:
        return TransactionEntityType.data;
      case PurchaseType.electricity_bill:
        return TransactionEntityType.electricity_bill;
      case PurchaseType.tv_subscription:
        return TransactionEntityType.tv_subscription;
    }
  }

  /**
   * Writes the wallet debit for a delivered purchase — idempotent: skips
   * when a debit for this purchase already exists, so the create flow, the
   * verification path, and the retry path can never double-debit.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async ensurePurchaseDebit(
    purchase: PurchaseRequest,
    providerResponse: any,
  ) {
    const entityType = this.purchaseEntityType(purchase.type);

    const existing = await this.transactionsRepository.findOne({
      where: {
        entity_id: purchase.id,
        entity_type: entityType,
        mode: TransactionModeType.debit,
      },
    });
    if (existing) return;

    await this.transactionsRepository.save({
      user_id: purchase.user_id,
      coin_amount: 0,
      mode: TransactionModeType.debit,
      entity_type: entityType,
      metadata: {
        vtpass_response: providerResponse,
        provider: purchase.provider,
        phone: purchase.metadata?.phone,
      },
      exchange_rate_id: null,
      currency: "NGN",
      entity_id: purchase.id,
      amount: purchase.amount,
      masamasa_ref: generateMasamasaRef(),
      status: TransactionStatusType.success,
    } as unknown as Transactions);
  }

  /**
   * Re-initiates a purchase that was parked because OUR VTPass account had
   * insufficient balance (the request never reached VTPass). Re-using the
   * same request_id is safe — VTPass rejects a duplicate request_id (code
   * 014), so a purchase that actually went through cannot run twice.
   */
  private async retryPurchaseInitiation(purchase: PurchaseRequest) {
    const retries = purchase.metadata?.initiation_retries ?? 0;

    if (retries >= CronJob.MAX_PURCHASE_RETRIES) {
      await this.purchaseRequestRepository.update(
        { id: purchase.id },
        {
          status: PurchaseStatus.failed,
          metadata: {
            ...purchase.metadata,
            needs_initiation: false,
            note: "Retry cap reached — purchase could not be completed",
          },
        },
      );
      console.log(
        `Purchase ${purchase.masamasa_ref} hit the retry cap — marked failed (user was never charged)`,
      );
      return;
    }

    // The user's wallet was only checked at creation time — never deliver
    // (and debit) later against a balance that is no longer there.
    const balance = await this.transactionsService.getAccountBalance(
      purchase.user_id,
    );
    if (balance < purchase.amount) {
      await this.purchaseRequestRepository.update(
        { id: purchase.id },
        {
          status: PurchaseStatus.failed,
          metadata: {
            ...purchase.metadata,
            needs_initiation: false,
            error: "Insufficient wallet balance",
          },
        },
      );
      return;
    }

    let resp: { status: boolean; message?: string; data?: any };
    switch (purchase.type) {
      case PurchaseType.airtime:
        resp = await this.providerService.processAirtimePurchase(
          purchase,
          purchase.masamasa_ref,
        );
        break;
      case PurchaseType.data:
        resp = await this.providerService.processDataPurchase(
          purchase,
          purchase.masamasa_ref,
        );
        break;
      case PurchaseType.electricity_bill: {
        const user = await this.dataSource
          .getRepository(User)
          .findOne({ where: { id: purchase.user_id } });
        if (!user) return;
        resp = await this.providerService.processElectricityPurchase(
          purchase,
          purchase.masamasa_ref,
          user,
        );
        break;
      }
      default:
        console.log(
          `No re-initiation handler for purchase type ${purchase.type} (${purchase.masamasa_ref})`,
        );
        return;
    }

    if (!resp.status) {
      // Still failing (most likely the provider balance is still low) —
      // count the attempt and let the next run try again.
      await this.purchaseRequestRepository.update(
        { id: purchase.id },
        {
          metadata: {
            ...purchase.metadata,
            initiation_retries: retries + 1,
            last_error: resp.message,
          },
        },
      );
      return;
    }

    const tx = resp.data?.content?.transactions;
    if (tx?.status === "delivered") {
      await this.purchaseRequestRepository.update(
        { id: purchase.id },
        {
          status: PurchaseStatus.processed,
          commission: tx.commission,
          other_ref: tx.transactionId,
          metadata: {
            ...purchase.metadata,
            needs_initiation: false,
            provider_response: resp.data,
          },
        },
      );

      // The wallet debit is normally written by the create flow's delivered
      // branch — this delivery happened via retry, so write it here.
      await this.ensurePurchaseDebit(purchase, resp.data);

      console.log(
        `Purchase ${purchase.masamasa_ref} delivered on retry ${retries + 1}`,
      );
    } else {
      // Accepted but not yet delivered — hand over to the normal
      // verification path (needs_initiation cleared).
      await this.purchaseRequestRepository.update(
        { id: purchase.id },
        {
          metadata: {
            ...purchase.metadata,
            needs_initiation: false,
            initiation_retries: retries + 1,
            provider_response: resp.data,
          },
        },
      );
    }
  }

  // ── Provider balance monitoring ────────────────────────────────────────
  private static readonly NOMBA_BALANCE_THRESHOLD = 500000;
  private static readonly VTPASS_BALANCE_THRESHOLD = 50000;
  private static readonly BALANCE_ALERT_EMAILS = [
    "kindas3325@gmail.com",
    "Iamseyifocus@gmail.com",
    "Lawvet4@gmail.com",
    "masamasaltd@gmail.com",
  ];
  // While a balance stays low, re-alert at most once every 1 hours — the
  // job runs every 5 minutes and must not send 288 emails a day.
  private static readonly BALANCE_ALERT_COOLDOWN_MS = 1 * 60 * 60 * 1000;
  private lastBalanceAlertAt: Record<string, number> = {};

  /**
   * Checks the Nomba and VTPass account balances and emails an alert when
   * either drops below its threshold. Each provider is checked
   * independently so one failing API never hides the other's balance.
   */
  async monitorProviderBalances() {
    // Nomba
    try {
      let accessToken = await this.accessTokenRepository.findOne({
        where: { type: AccessTokenType.nomba },
      });
      if (!accessToken) {
        accessToken = await this.generateNombaAccessToken();
      }
      if (accessToken?.token) {
        const res = await axiosClient(
          `${appConfig.NOMBA_BASE_URL}/v1/accounts/balance`,
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
        const balance = parseFloat(res?.data?.amount);
        console.log("Nomba account balance:", balance);
        if (!isNaN(balance) && balance < CronJob.NOMBA_BALANCE_THRESHOLD) {
          this.sendLowBalanceAlert(
            "Nomba",
            balance,
            CronJob.NOMBA_BALANCE_THRESHOLD,
          );
        }
      }
    } catch (e: any) {
      console.log(
        "Nomba balance check failed:",
        e?.response?.data ?? e?.message,
      );
    }

    // VTPass
    try {
      const res = await axiosClient(`${appConfig.VTPASS_URL}/balance`, {
        headers: {
          "api-key": appConfig.VTPASS_API_KEY,
          "public-key": appConfig.VTPASS_PUBLIC_KEY,
        },
        timeout: 15000,
      });
      console.log("VTPass balance response:", res);
      const balance = parseFloat(
        res?.contents?.balance ?? res?.content?.balance,
      );
      console.log("VTPass account balance:", balance);
      if (!isNaN(balance) && balance < CronJob.VTPASS_BALANCE_THRESHOLD) {
        this.sendLowBalanceAlert(
          "VTPass",
          balance,
          CronJob.VTPASS_BALANCE_THRESHOLD,
        );
      }
    } catch (e: any) {
      console.log(
        "VTPass balance check failed:",
        e?.response?.data ?? e?.message,
      );
    }
  }

  private sendLowBalanceAlert(
    provider: string,
    balance: number,
    threshold: number,
  ) {
    const now = Date.now();
    const last = this.lastBalanceAlertAt[provider] ?? 0;
    // if (now - last < CronJob.BALANCE_ALERT_COOLDOWN_MS) return;
    this.lastBalanceAlertAt[provider] = now;

    for (const email of CronJob.BALANCE_ALERT_EMAILS) {
      sendLowBalanceAlertEmail(email, { provider, balance, threshold });
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
    } catch (e: any) {
      console.log("Error generating Nomba access token:", e);
      // // this.monitorService.recordError(e);
      throw new BadRequestException(e.message);
    }
  }
}
