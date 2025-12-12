import { transfer, verifyTransfer } from "@/core/utils";
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
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

@Injectable()
export class CronJob {
  constructor(
    @InjectRepository(Transactions)
    private readonly transactionsRepository: Repository<Transactions>,
    @InjectRepository(PurchaseRequest)
    private readonly purchaseRequestRepository: Repository<PurchaseRequest>,
    private readonly adminService: AdministratorService,
    private readonly providerService: ProviderService
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
      try {
        const resp = await transfer({
          amount: trans.amount,
          bankCode: trans.metadata.bankCode,
          accountNumber: trans.metadata.accountNumber,
          ref: trans.masamasa_ref,
          narration: "Transfer from Masamasa",
        });
        console.log("resp from transfer", resp);
        if (resp.status) {
          await this.transactionsRepository.update(
            { id: trans.id },
            {
              status: TransactionStatusType.pending,
              retry: trans.retry + 1,
              session_id: resp.data.data.id,
              metadata: {
                ...trans.metadata,
                error: null,
                initiate_resp: resp.data,
              },
            }
          );
        } else {
          await this.transactionsRepository.update(
            { id: trans.id },
            {
              status: TransactionStatusType.failed,
              metadata: {
                ...trans.metadata,
                error: resp.message,
              },
            }
          );
          console.log("eerrr", resp.data);
        }
      } catch (e) {
        console.log("eerrr eee", e);
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

    for (const trans of transactions) {
      try {
        const resp = await verifyTransfer({ id: trans.session_id });
        console.log("resp", resp);
        if (resp.status) {
          await this.transactionsRepository.update(
            { id: trans.id },
            {
              status: TransactionStatusType.success,
              session_id: resp.data.id,
              metadata: {
                ...trans.metadata,
                flutterwave_resp: resp.data,
                error: null,
              },
            }
          );
        } else {
          await this.transactionsRepository.update(
            { id: trans.id },
            {
              metadata: {
                ...trans.metadata,
                error: resp.message,
                failed_resp: resp.data,
              },
            }
          );
          console.log("eerrr", resp.data);
        }
      } catch (e) {
        console.log("eerrr eee", e);
      }
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
}
