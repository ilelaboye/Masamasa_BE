import { UserRequest } from "@/definitions";
import { Injectable } from "@nestjs/common";
import { Repository, SelectQueryBuilder } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import {
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

    // One open-ended range rather than the three overlapping BETWEEN clauses
    // this used to build. An absent bound is expressed by omitting it, not by
    // pinning it to 1970/now, so Postgres can walk the index range directly.
    const startDate = date_from ? new Date(date_from).toISOString() : null;
    const endDate = date_to ? endOfDay(new Date(date_to)) : null;

    const filtered = () => {
      const qb: SelectQueryBuilder<Transactions> = this.transactionRepository
        .createQueryBuilder("transactions")
        .where("transactions.user_id = :user_id", { user_id: req.user.id });

      if (startDate) {
        qb.andWhere("transactions.created_at >= :startDate", { startDate });
      }
      if (endDate) {
        qb.andWhere("transactions.created_at <= :endDate", { endDate });
      }
      return qb;
    };

    // Counted without the join or the json metadata column, so it is served
    // from the (user_id, created_at) index alone.
    const count = await filtered().getCount();

    if (count === 0) {
      return { transactions: [], metadata: paginate(0, page, limit) };
    }

    const transactions = await filtered()
      // exchange_rate is ManyToOne, so the join cannot multiply rows. That
      // lets the page be cut with raw LIMIT/OFFSET instead of TypeORM's
      // skip/take, which would add a DISTINCT-id subquery and a second round
      // trip once a join is present.
      .leftJoin("transactions.exchange_rate", "exchange_rate")
      .addSelect([
        "exchange_rate.id",
        "exchange_rate.rate",
        "exchange_rate.currency",
      ])
      .orderBy("transactions.created_at", "DESC")
      // Tie-breaker: rows sharing a created_at would otherwise be ordered
      // arbitrarily, letting a row repeat on one page and vanish from the next.
      .addOrderBy("transactions.id", "DESC")
      .limit(limit)
      .offset(skip)
      .getMany();

    const metadata = paginate(count, page, limit);
    return { transactions, metadata };
  }

  async getAccountBalance(user_id: number) {
    const result = await this.transactionRepository
      .createQueryBuilder("transaction")
      .select(
        `
      SUM(
        CASE WHEN transaction.mode = :credit AND transaction.status = :success  THEN transaction.amount ELSE 0 END
      ) -
      SUM(
        CASE WHEN transaction.mode = :debit AND transaction.status IN (:success, :processing) THEN transaction.amount ELSE 0 END
      )
    `,
        "balance",
      )
      .where("transaction.user_id = :user_id", { user_id: user_id })
      .setParameters({
        credit: TransactionModeType.credit,
        debit: TransactionModeType.debit,
        success: TransactionStatusType.success,
        processing: TransactionStatusType.processing,
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
