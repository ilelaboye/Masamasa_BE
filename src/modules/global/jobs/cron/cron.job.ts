import { transfer, verifyTransfer } from "@/core/utils";
import { AdministratorService } from "@/modules/administrator/services/administrator.service";
import {
  TransactionEntityType,
  Transactions,
  TransactionStatusType,
} from "@/modules/transactions/transactions.entity";
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { retry } from "rxjs";
import { Repository } from "typeorm";

@Injectable()
export class CronJob {
  constructor(
    @InjectRepository(Transactions)
    private readonly transactionsRepository: Repository<Transactions>,
    private readonly adminService: AdministratorService
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
        console.log("resp", resp);
        if (resp.status) {
          await this.transactionsRepository.update(
            { id: trans.id },
            {
              status: TransactionStatusType.pending,
              retry: trans.retry + 1,
              session_id: resp.data.id,
              metadata: {
                ...trans.metadata,
                error: null,
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
}
