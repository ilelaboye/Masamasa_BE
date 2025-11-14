import { transfer } from "@/core/utils";
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
    //   Logger.log("START VERIFYING TRANSACTION");
    //   const payments = await this.paymentRequestRepository
    //     .createQueryBuilder("paymentRequest")
    //     .leftJoinAndSelect("paymentRequest.payee", "payee")
    //     .leftJoinAndSelect("paymentRequest.company", "company")
    //     .where("paymentRequest.status = :status", {
    //       status: PaymentRequestStatus.processing,
    //     })
    //     .andWhere("paymentRequest.type = :type", {
    //       type: PaymentRequestType.online,
    //     })
    //     .andWhere("paymentRequest.retry > :retry", { retry: 0 })
    //     .getMany();
    //   for (const payment of payments) {
    //     const transaction_ref = `${payment.bsmp_ref}`;
    //     if (
    //       payment.method == PaymentRequestMethod.payaza &&
    //       payment.type == PaymentRequestType.online
    //     ) {
    //       try {
    //         const resp = await this.payazaService.verifyTransfer(transaction_ref);
    //         console.log("llll", resp.data);
    //         if (
    //           resp.data.transactionStatus == PayazaTransactionStatus.NIP_SUCCESS
    //         ) {
    //           try {
    //             const transaction = await this.transactionRepository.save({
    //               amount: payment.amount,
    //               business_purpose: payment.business_purpose,
    //               company: { id: payment.company_id },
    //               currency: { id: payment.currency_id },
    //               entity_type: SystemEntities.payment,
    //               entity_mode: payment.type,
    //               entity_id: payment.id,
    //               mode: TransactionModeType.debit,
    //               status: TransactionStatusType.success,
    //               due_at: payment.due_at,
    //               transaction_number:
    //                 await this.transactionsService.generateNextTransactionNumber(),
    //             });
    //             await this.paymentRequestRepository.update(
    //               { id: payment.id },
    //               {
    //                 status: PaymentRequestStatus.processed,
    //                 paid_at: resp.data.transactionDateTime,
    //                 left_at: resp.data.transactionDateTime,
    //                 provider_fee: resp.data.fee,
    //                 session_id: resp.data.sessionId,
    //                 bank_ref: resp.data.sessionId,
    //                 metadata: {
    //                   error: null,
    //                   payaza_response: resp,
    //                   ...payment.metadata,
    //                 },
    //               }
    //             );
    //             await this.requestActivityRepository.insert({
    //               actioned_by: { id: payment.raised_by_id },
    //               action: RequestActivityActionType.PROCESS_PAYMENT_REQUEST,
    //               entity_type: RequestQueueEntity.payment,
    //               entity_id: payment.id,
    //               action_note: `Payment ${payment.payment_number} is paid`,
    //             });
    //             if (payment.payee && payment.payee.email) {
    //               sendMailJetWithTemplate(
    //                 {
    //                   to: {
    //                     name: `${capitalizeString(payment.payee.name)}`,
    //                     email: payment.payee?.email,
    //                   },
    //                 },
    //                 {
    //                   subject: `${payment.company.name} has paid you`,
    //                   templateId: MAILJETTemplates.payee_payment_receipt,
    //                   variables: {
    //                     company_name: payment.company.name,
    //                     user_name: capitalizeString(payment.payee.name),
    //                     amount: currencyFormatter(
    //                       moneyReverter(payment.amount),
    //                       "NGN",
    //                       2,
    //                       false
    //                     ),
    //                     account_number: payment.payee.account_number,
    //                     account_name: payment.payee.account_name,
    //                     date: formateDate(new Date()),
    //                     ref: payment.bsmp_ref,
    //                     bank_ref: resp.data.sessionId,
    //                     bank_name: payment.payee.bank_name,
    //                   },
    //                 }
    //               );
    //             }
    //           } catch (e) {
    //             console.log("saving transaction failed ", e);
    //           }
    //         } else if (
    //           resp.data.transactionStatus == PayazaTransactionStatus.NIP_FAILURE
    //         ) {
    //           await this.paymentRequestRepository.update(
    //             { id: payment.id },
    //             {
    //               status: PaymentRequestStatus.failed,
    //               metadata: { error: null, ...payment.metadata },
    //             }
    //           );
    //           await this.requestActivityRepository.insert({
    //             actioned_by: { id: payment.raised_by_id },
    //             action: RequestActivityActionType.DISBURSED_PAYMENT_REQUEST,
    //             entity_type: RequestQueueEntity.payment,
    //             entity_id: payment.id,
    //             action_note: `Payment ${payment.payment_number} failed ${resp?.data?.responseMessage ? "because " + resp?.data?.responseMessage : ""}`,
    //           });
    //         }
    //         // await this.paymentRequestRepository.update({ id: payment.id }, { retry: payment.retry++ });
    //       } catch (e) {
    //         await this.paymentRequestRepository.update(
    //           { id: payment.id },
    //           { metadata: { error: e, ...payment.metadata } }
    //         );
    //       }
    //     }
    //   }
  }
}
