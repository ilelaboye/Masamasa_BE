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
  Transactions,
  TransactionStatusType,
} from "@/modules/transactions/transactions.entity";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  AccessToken,
  AccessTokenType,
} from "../../bank-verification/entities/access-token.entity";
import { appConfig } from "@/config";
import { UsersService } from "@/modules/users/services/users.service";
import { generateMasamasaRef } from "@/core/helpers";

@Injectable()
export class CronJob {
  constructor(
    @InjectRepository(Transactions)
    private readonly transactionsRepository: Repository<Transactions>,
    @InjectRepository(PurchaseRequest)
    private readonly purchaseRequestRepository: Repository<PurchaseRequest>,
    @InjectRepository(AccessToken)
    private readonly accessTokenRepository: Repository<AccessToken>,
    private readonly adminService: AdministratorService,
    private readonly providerService: ProviderService
    // private readonly usersService: UsersService
  ) {}

  // Handles all notification jobs
  async processPaymentJob() {
    Logger.log("START PROCESSING");
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
      const balance = await this.adminService.getUserWalletBalance(
        trans.user_id
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
          }
        );
        continue;
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
          }
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
            }
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
            }
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
    }
  }

  async verifyTransactionJob() {
    Logger.log("START VERIFYING MASAMASA TRANSACTION");
    const transactions = await this.transactionsRepository
      .createQueryBuilder("trans")
      .where("trans.status = :status", {
        status: TransactionStatusType.pending,
      })
      .andWhere("trans.entity_type = :type", {
        type: TransactionEntityType.withdrawal,
      })
      .getMany();

    if (transactions.length > 0) {
      var accessToken = await this.accessTokenRepository.findOne({
        where: { type: AccessTokenType.nomba },
      });

      if (!accessToken) {
        accessToken = await this.generateNombaAccessToken();
      }
    }

    for (const trans of transactions) {
      try {
        const res = await axiosClient(
          `${appConfig.NOMBA_BASE_URL}/v1/transactions/accounts/single?orderReference=${trans.session_id}`,
          {
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              accountId: appConfig.NOMBA_ACCOUNT_ID,
              Authorization: `Bearer ${accessToken!.token}`,
            },
          }
        );
        console.log("Nomba bank verify transfer", res.data);
      } catch (e) {
        console.log("Error from Nomba verify Transfer:", e.response.data);
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
      //     await this.transactionsRepository.update(
      //       { id: trans.id },
      //       {
      //         metadata: {
      //           ...trans.metadata,
      //           error: resp.message,
      //           failed_resp: resp.data,
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

  async verifyProcessingVtpassTransactions() {
    Logger.log("START VERIFYING VTPASS TRANSACTION");
    const purchases = await this.purchaseRequestRepository
      .createQueryBuilder("purchase")
      .where("purchase.status = :status", {
        status: PurchaseStatus.processing,
      })
      .getMany();

    for (const purchase of purchases) {
      // Logic to verify VTPass transaction
      const verify = await this.providerService.verifyVtpassTransaction(
        purchase.masamasa_ref
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
            }
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
            }
          );
        }
      }
    }
  }

  async generateNombaAccessToken() {
    Logger.log("START GENERATING NOMBA ACCESS TOKEN");

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
        }
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
