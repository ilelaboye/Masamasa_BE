import { UserRequest } from "@/definitions";
import { Injectable } from "@nestjs/common";
import { Repository, SelectQueryBuilder } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import {
  TransactionEntityType,
  TransactionModeType,
  Transactions,
  TransactionStatusType,
} from "./transactions.entity";
import { endOfDay, getRequestQuery } from "@/core/utils";
import { generateMasamasaRef, paginate } from "@/core/helpers";

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transactions)
    private readonly transactionRepository: Repository<Transactions>,
  ) {}

  async findAll(req: UserRequest) {
    const { limit, page, skip, date_from, date_to } = getRequestQuery(req);
    let count = 0;
    let transactions;
    let queryRunner: SelectQueryBuilder<Transactions> =
      this.transactionRepository
        .createQueryBuilder("transactions")
        .where("user_id = :user_id", { user_id: req.user.id })
        .andWhere("status = :status", { status: TransactionStatusType.success })
        .orderBy("transactions.created_at", "DESC");

    if (date_from) {
      queryRunner = queryRunner.andWhere(
        "transactions.created_at BETWEEN :startDate AND :endDate",
        {
          startDate: new Date(date_from).toISOString(),
          endDate: new Date().toISOString(),
        },
      );
    }
    if (date_to) {
      queryRunner = queryRunner.andWhere(
        "transactions.created_at BETWEEN :startDate AND :endDate",
        {
          startDate: new Date(1970).toISOString(),
          endDate: endOfDay(new Date(date_to)),
        },
      );
    }
    if (date_from && date_to) {
      queryRunner = queryRunner.andWhere(
        "transactions.created_at BETWEEN :startDate AND :endDate",
        {
          startDate: new Date(date_from).toISOString(),
          endDate: endOfDay(new Date(date_to)),
        },
      );
    }

    count = await queryRunner.getCount();
    transactions = await queryRunner.skip(skip).take(limit).getMany();

    const metadata = paginate(count, page, limit);
    return { transactions, metadata };
  }

  async getAccountBalance(req: UserRequest) {
    const { user } = req;
    const result = await this.transactionRepository
      .createQueryBuilder("transaction")
      .select(
        `
      SUM(
        CASE WHEN transaction.mode = :credit AND transaction.status = :success  THEN transaction.amount ELSE 0 END
      ) -
      SUM(
        CASE WHEN transaction.mode = :debit AND transaction.status = :success THEN transaction.amount ELSE 0 END
      )
    `,
        "balance",
      )
      .where("transaction.user_id = :user_id", { user_id: user.id })
      .setParameters({
        credit: TransactionModeType.credit,
        debit: TransactionModeType.debit,
        success: TransactionStatusType.success,
      })
      .getRawOne();

    // console.log("result", result);
    return parseFloat(result.balance) || 0;
  }

  async saveTransaction({
    user_id,
    amount,
    mode,
    entity_type,
    entity_id,
    network,
    coin_amount,
    wallet_address,
    metadata,
    exchange_rate_id,
    currency,
    dollar_amount,
    coin_exchange_rate,
    status = TransactionStatusType.success,
  }) {
    const trans = await this.transactionRepository.save({
      user_id: user_id,
      network: network,
      coin_amount: coin_amount,
      wallet_address: wallet_address,
      mode: mode,
      entity_type: entity_type,
      metadata: metadata,
      exchange_rate_id: exchange_rate_id,
      currency: currency,
      entity_id: entity_id,
      dollar_amount: dollar_amount,
      amount: amount,
      coin_exchange_rate: coin_exchange_rate,
      masamasa_ref: generateMasamasaRef(),
      status: status,
    } as unknown as Transactions);
    return trans;
  }
}
