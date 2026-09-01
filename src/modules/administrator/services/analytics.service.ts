import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ObjectLiteral, Repository, SelectQueryBuilder } from "typeorm";
import { KycStatus, Status, User } from "@/modules/users/entities/user.entity";
import {
  TransactionEntityType,
  TransactionModeType,
  Transactions,
  TransactionStatusType,
} from "@/modules/transactions/transactions.entity";
import { PurchaseRequest } from "@/modules/purchases/entities/purchases.entity";
import { ReferralEarning } from "@/modules/referrals/entities/referral-earning.entity";
import { paginate } from "@/core/helpers";
import { endOfDay, startOfDay } from "@/core/utils";

export type AnalyticsPeriod = "today" | "week" | "month" | "year";
export type VolumeGranularity = "daily" | "weekly" | "monthly" | "yearly";

/**
 * Timezone the product's calendar days are measured in. Matches `TZ` in the
 * environment, which is what every `setHours(0, 0, 0, 0)` here resolves
 * against — SQL day buckets must agree with it or they will not join.
 */
const REPORTING_TIMEZONE = "Africa/Lagos";

/**
 * SQL expression bucketing a bare UTC `timestamp` column into a
 * REPORTING_TIMEZONE calendar day, rendered as `YYYY-MM-DD`.
 *
 * The column is labelled UTC before the shift because `timestamp without time
 * zone` carries no offset of its own (see config/pg-timezone.ts). Rendering
 * the bucket as text rather than a timestamp keeps the join key exact: an
 * instant would have to survive the driver's UTC parser and a second
 * conversion in JS before it could be compared.
 */
function localDayBucket(column: string): string {
  return `TO_CHAR(${column} AT TIME ZONE 'UTC' AT TIME ZONE '${REPORTING_TIMEZONE}', 'YYYY-MM-DD')`;
}

/** Local calendar date of `date` as `YYYY-MM-DD` — the JS side of that join. */
function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Start of the current calendar period — this week, this month, this year —
 */
function periodStart(period: AnalyticsPeriod): Date {
  const now = new Date();
  switch (period) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "week": {
      // Weeks start on Sunday,.
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay());
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "year":
      return new Date(now.getFullYear(), 0, 1);
  }
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Transactions)
    private readonly transactionsRepository: Repository<Transactions>,
    @InjectRepository(PurchaseRequest)
    private readonly purchaseRepository: Repository<PurchaseRequest>,
  ) {}

  /**
   * Headline numbers for the analytics overview cards.
   *
   * `period` scopes only the three lifetime counts — signups, funded accounts
   * and transacting users. Omit it for all-time, which is what the dashboard
   * does; the "today" figures are unaffected either way.
   */
  async overview(period?: AnalyticsPeriod, dateFrom?: string, dateTo?: string) {
    const startOfToday = periodStart("today");

    // An explicit range wins over the period toggle — the UI offers both, and
    // picking dates is the more specific intent.
    let totalsStart: Date | null = null;
    let totalsEnd: Date | null = null;

    if (dateFrom || dateTo) {
      if (dateFrom) {
        totalsStart = new Date(dateFrom);
        totalsStart.setHours(0, 0, 0, 0);
      }
      totalsEnd = dateTo ? new Date(dateTo) : new Date();
      totalsEnd.setHours(23, 59, 59, 999);

      if (totalsStart && totalsStart > totalsEnd) {
        throw new BadRequestException(
          "Start date cannot be after the end date",
        );
      }
    } else if (period) {
      totalsStart = periodStart(period);
    }

    // Deposit fees are excluded
    const todayTx = await this.transactionsRepository
      .createQueryBuilder("t")
      .select("COUNT(*)", "count")
      .addSelect("COALESCE(SUM(t.amount), 0)", "volume")
      .where("t.created_at >= :start", { start: startOfToday })
      .andWhere("t.status = :status", {
        status: TransactionStatusType.success,
      })
      .andWhere("t.entity_type != :feeType", {
        feeType: TransactionEntityType.deposit_fee,
      })
      .getRawOne();

    // Revenue: deposit fees + purchase commissions
    const feesToday = await this.transactionsRepository
      .createQueryBuilder("t")
      .select("COALESCE(SUM(t.dollar_amount), 0)", "deposit_fees_usd")
      .where("t.entity_type = :type", {
        type: TransactionEntityType.deposit_fee,
      })
      .andWhere("t.created_at >= :start", { start: startOfToday })
      .getRawOne();

    const commissionToday = await this.purchaseRepository
      .createQueryBuilder("p")
      .select("COALESCE(SUM(p.commission), 0)", "commission")
      .where("p.created_at >= :start", { start: startOfToday })
      .getRawOne();

    const signupsToday = await this.userRepository
      .createQueryBuilder("u")
      .where("u.created_at >= :start", { start: startOfToday })
      .getCount();

    // Users active today: seen by the API (last_seen_at) or transacting
    const activeToday = await this.userRepository
      .createQueryBuilder("u")
      .where("u.last_seen_at >= :start", { start: startOfToday })
      .getCount();

    const transactingToday = await this.transactionsRepository
      .createQueryBuilder("t")
      .select("COUNT(DISTINCT t.user_id)", "count")
      .where("t.created_at >= :start", { start: startOfToday })
      .getRawOne();

    // What the platform currently owes its users, summed across every wallet.
    // Deliberately mirrors the per-user formula the app itself uses
    // (TransactionService.getAccountBalance) — counting debits that are still
    // processing, since a withdrawal in flight has already left the user's
    // spendable balance — so this total reconciles with the balances users
    // see in the app.
    const wallets = await this.transactionsRepository
      .createQueryBuilder("t")
      .select(
        `
      SUM(CASE WHEN t.mode = :credit AND t.status = :success THEN t.amount ELSE 0 END) -
      SUM(CASE WHEN t.mode = :debit AND t.status IN (:success, :processing) THEN t.amount ELSE 0 END)
    `,
        "balance",
      )
      .setParameters({
        credit: TransactionModeType.credit,
        debit: TransactionModeType.debit,
        success: TransactionStatusType.success,
        processing: TransactionStatusType.processing,
      })
      .getRawOne();

    // All-time distinct users, unlike the "today" figures above. Funded means
    // money has ever landed in the account — a crypto deposit or a transfer
    // received; transacting means money has ever moved either way.
    const fundedQuery = this.transactionsRepository
      .createQueryBuilder("t")
      .select("COUNT(DISTINCT t.user_id)", "count")
      .where("t.status = :status", { status: TransactionStatusType.success })
      .andWhere("t.mode = :mode", { mode: TransactionModeType.credit });

    const transactingQuery = this.transactionsRepository
      .createQueryBuilder("t")
      .select("COUNT(DISTINCT t.user_id)", "count")
      .where("t.status = :status", { status: TransactionStatusType.success });

    const totalUsersQuery = this.userRepository.createQueryBuilder("u");

    if (totalsStart) {
      fundedQuery.andWhere("t.created_at >= :totalsStart", { totalsStart });
      transactingQuery.andWhere("t.created_at >= :totalsStart", {
        totalsStart,
      });
      totalUsersQuery.andWhere("u.created_at >= :totalsStart", { totalsStart });
    }

    if (totalsEnd) {
      fundedQuery.andWhere("t.created_at <= :totalsEnd", { totalsEnd });
      transactingQuery.andWhere("t.created_at <= :totalsEnd", { totalsEnd });
      totalUsersQuery.andWhere("u.created_at <= :totalsEnd", { totalsEnd });
    }

    const fundedAccounts = await fundedQuery.getRawOne();
    const transactingUsers = await transactingQuery.getRawOne();
    const totalUsers = await totalUsersQuery.getCount();

    // How long it takes a new user to reach their first trade — signup to the
    // earliest spend (cash-out or bill purchase).

    const timeToTradeQuery = this.userRepository
      .createQueryBuilder("u")
      .innerJoin(
        (qb) =>
          qb
            .select("t.user_id", "user_id")
            .addSelect("MIN(t.created_at)", "first_trade_at")
            .from(Transactions, "t")
            .where("t.status = :tradeStatus")
            .andWhere("t.entity_type IN (:...tradeTypes)")
            .groupBy("t.user_id"),
        "ft",
        "ft.user_id = u.id",
      )
      .select(
        "AVG(EXTRACT(EPOCH FROM (ft.first_trade_at - u.created_at)))",
        "avg_seconds",
      )
      .addSelect(
        `PERCENTILE_CONT(0.5) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (ft.first_trade_at - u.created_at))
         )`,
        "median_seconds",
      )
      .addSelect("COUNT(*)", "users")
      // Guards against clock skew or backfilled rows producing negative times.
      .where("ft.first_trade_at >= u.created_at")
      .setParameters({
        tradeStatus: TransactionStatusType.success,
        tradeTypes: [
          TransactionEntityType.withdrawal,
          TransactionEntityType.airtime,
          TransactionEntityType.data,
          TransactionEntityType.electricity_bill,
          TransactionEntityType.tv_subscription,
        ],
      });

    if (totalsEnd) {
      timeToTradeQuery.andWhere("u.created_at <= :totalsEnd", { totalsEnd });
    }

    if (totalsStart) {
      timeToTradeQuery.andWhere("u.created_at >= :totalsStart", {
        totalsStart,
      });
    }

    const timeToTrade = await timeToTradeQuery.getRawOne();

    // Repeat rate: of the users who have been funded, how many transacted
    // again within the selected period of that first funding.

    const repeatWindowDays = period
      ? { today: 1, week: 7, month: 30, year: 365 }[period]
      : null;
    const repeatQuery = this.userRepository
      .createQueryBuilder("u")
      .innerJoin(
        (qb) =>
          qb
            .select("t.user_id", "user_id")
            .addSelect("MIN(t.created_at)", "first_funded_at")
            .from(Transactions, "t")
            .where("t.status = :repeatStatus")
            .andWhere("t.mode = :repeatMode")
            .groupBy("t.user_id"),
        "ff",
        "ff.user_id = u.id",
      )
      .select("COUNT(*)", "funded_users")
      .addSelect(
        `COUNT(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM transactions r
           WHERE r.user_id = u.id
             AND r.status = :repeatStatus
             AND r.created_at > ff.first_funded_at
             ${
               repeatWindowDays
                 ? `AND r.created_at <= ff.first_funded_at
                      + make_interval(days => :repeatWindowDays)`
                 : ""
             }
         ))`,
        "repeat_users",
      )
      .setParameters({
        repeatStatus: TransactionStatusType.success,
        repeatMode: TransactionModeType.credit,
        ...(repeatWindowDays ? { repeatWindowDays } : {}),
      });

    if (totalsEnd) {
      repeatQuery.andWhere("u.created_at <= :totalsEnd", { totalsEnd });
    }

    if (totalsStart) {
      repeatQuery.andWhere("u.created_at >= :totalsStart", { totalsStart });
    }

    // Only count users whose window has actually closed. Someone funded an
    // hour ago has not had a week to come back, and including them would
    // push the rate down for reasons that have nothing to do with retention.
    if (repeatWindowDays) {
      repeatQuery.andWhere(
        "ff.first_funded_at <= NOW() - make_interval(days => :repeatWindowDays)",
      );
    }

    const repeat = await repeatQuery.getRawOne();
    const fundedMeasured = Number(repeat?.funded_users) || 0;
    const repeatUsers = Number(repeat?.repeat_users) || 0;

    const toHours = (seconds: unknown) =>
      seconds === null || seconds === undefined
        ? null
        : Math.round((Number(seconds) / 3600) * 10) / 10;
    // "Pending KYC" = everyone who has not completed KYC yet
    // (total users minus KYC-verified), not just status = pending.
    const kycVerified = await this.userRepository.count({
      where: { kyc_status: KycStatus.success },
    });
    const pendingKyc = totalUsers - kycVerified;

    return {
      today_transaction_count: Number(todayTx.count) || 0,
      today_volume: Number(todayTx.volume) || 0,
      today_deposit_fees_usd: Number(feesToday.deposit_fees_usd) || 0,
      today_purchase_commission: Number(commissionToday.commission) || 0,
      signups_today: signupsToday,
      active_users_today: activeToday,
      transacting_users_today: Number(transactingToday.count) || 0,
      total_users: totalUsers,
      funded_accounts: Number(fundedAccounts.count) || 0,
      total_transacting_users: Number(transactingUsers.count) || 0,
      avg_signup_to_first_trade_hours: toHours(timeToTrade?.avg_seconds),
      median_signup_to_first_trade_hours: toHours(timeToTrade?.median_seconds),
      users_with_first_trade: Number(timeToTrade?.users) || 0,
      // Null when nobody has been funded — a 0% rate would imply everyone
      // failed to come back
      repeat_rate_percent:
        fundedMeasured > 0
          ? Math.round((repeatUsers / fundedMeasured) * 1000) / 10
          : null,
      repeat_users: repeatUsers,
      funded_users_measured: fundedMeasured,
      // Null means the window is open — any later transaction counted.
      repeat_window_days: repeatWindowDays,
      users_balance: Number(wallets.balance) || 0,
      pending_kyc: pendingKyc,
    };
  }

  /** Transactions per user for a rolling period, heaviest users first. */
  async transactionsPerUser(period: AnalyticsPeriod, page = 1, limit = 20) {
    const start = periodStart(period);

    const base = this.transactionsRepository
      .createQueryBuilder("t")
      .innerJoin("t.user", "u")
      .select("u.id", "user_id")
      .addSelect("u.first_name", "first_name")
      .addSelect("u.last_name", "last_name")
      .addSelect("u.email", "email")
      .addSelect("u.country", "country")
      .addSelect("COUNT(*)", "transaction_count")
      .addSelect(
        `COALESCE(SUM(CASE WHEN t.status = '${TransactionStatusType.success}' THEN t.amount ELSE 0 END), 0)`,
        "volume",
      )
      .where("t.created_at >= :start", { start })
      .groupBy("u.id")
      .addGroupBy("u.first_name")
      .addGroupBy("u.last_name")
      .addGroupBy("u.email")
      .addGroupBy("u.country")
      .orderBy("volume", "DESC");

    const totalRow = await this.transactionsRepository
      .createQueryBuilder("t")
      .select("COUNT(DISTINCT t.user_id)", "count")
      .where("t.created_at >= :start", { start })
      .getRawOne();
    const count = Number(totalRow.count) || 0;

    const rows = await base
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany();

    return {
      period,
      users: rows.map((r) => ({
        ...r,
        transaction_count: Number(r.transaction_count) || 0,
        volume: Number(r.volume) || 0,
      })),
      metadata: paginate(count, page, limit),
    };
  }

  /**
   * Whole-day bounds for a leaderboard range — the start day from 00:00, the
   * end day through 23:59:59.999 so it is included. Null means unbounded.
   */
  private resolveDateRange(dateFrom?: string, dateTo?: string) {
    const parse = (value: string) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        throw new BadRequestException("Please provide a valid date range");
      }
      return date;
    };

    const from = dateFrom ? parse(dateFrom) : null;
    const to = dateTo ? parse(dateTo) : null;

    const start = from ? startOfDay(from) : null;
    const end = to ? endOfDay(to) : null;

    if (start && to && start > startOfDay(to)!) {
      throw new BadRequestException("Start date cannot be after the end date");
    }

    return { start, end };
  }

  async transactionLeaderboard(dateFrom?: string, dateTo?: string) {
    const { start, end } = this.resolveDateRange(dateFrom, dateTo);

    const qb = this.transactionsRepository
      .createQueryBuilder("t")
      .innerJoin("t.user", "u")
      .select("u.id", "user_id")
      .addSelect("u.first_name", "first_name")
      .addSelect("u.last_name", "last_name")
      .addSelect("u.email", "email")
      .addSelect("COUNT(*)", "deposit_count")
      .addSelect("COALESCE(SUM(t.dollar_amount), 0)", "volume")
      .addSelect("COALESCE(SUM(t.amount), 0)", "naira_volume")
      .where("t.entity_type = :type", {
        type: TransactionEntityType.deposit,
      })
      .andWhere("t.mode = :mode", { mode: TransactionModeType.credit })
      .andWhere("t.status = :status", {
        status: TransactionStatusType.success,
      })
      .groupBy("u.id")
      .addGroupBy("u.first_name")
      .addGroupBy("u.last_name")
      .addGroupBy("u.email")
      .orderBy("volume", "DESC")
      .addOrderBy("u.id", "ASC")
      .limit(10);

    if (start) qb.andWhere("t.created_at >= :start", { start });
    if (end) qb.andWhere("t.created_at <= :end", { end });

    const leaderboard = await qb.getRawMany();

    return {
      leaderboard,
    };
  }

  async referralLeaderboard(dateFrom?: string, dateTo?: string) {
    const { start, end } = this.resolveDateRange(dateFrom, dateTo);

    const qb = this.userRepository
      .createQueryBuilder("u")
      .innerJoin(
        User,
        "referee",
        "referee.referred_by_id = u.id AND referee.deleted_at IS NULL",
      )
      .leftJoin(
        ReferralEarning,
        "e",
        "e.user_id = u.id AND e.referee_id = referee.id",
      )
      .select("u.id", "user_id")
      .addSelect("u.first_name", "first_name")
      .addSelect("u.last_name", "last_name")
      .addSelect("u.email", "email")
      .addSelect("COUNT(DISTINCT referee.id)", "referral_count")
      .addSelect("COALESCE(SUM(e.amount), 0)", "total_earned")
      .groupBy("u.id")
      .addGroupBy("u.first_name")
      .addGroupBy("u.last_name")
      .addGroupBy("u.email")
      .orderBy("referral_count", "DESC")
      .addOrderBy("total_earned", "DESC")
      .addOrderBy("u.id", "ASC")
      .limit(10);

    if (start) qb.andWhere("referee.created_at >= :start", { start });
    if (end) qb.andWhere("referee.created_at <= :end", { end });

    const leaderboard = await qb.getRawMany();

    return {
      leaderboard,
    };
  }

  /**
   * Daily inflow vs outflow over a date range.
   *
   * Inflow  = successful credits (deposits, transfers received)
   * Outflow = successful debits (withdrawals, bill purchases, fees)
   *
   * Defaults to the last 30 days when no range is supplied.
   */
  async cashFlow(dateFrom?: string, dateTo?: string) {
    const start = dateFrom ? new Date(dateFrom) : new Date();
    if (!dateFrom) start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);

    // The end bound covers the whole day, not midnight.
    const end = dateTo ? new Date(dateTo) : new Date();
    end.setHours(23, 59, 59, 999);

    const rows = await this.transactionsRepository
      .createQueryBuilder("t")
      .select(`DATE_TRUNC('day', t.created_at)`, "day")
      .addSelect(
        `COALESCE(SUM(CASE WHEN t.mode = '${TransactionModeType.credit}' THEN t.amount ELSE 0 END), 0)`,
        "inflow",
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN t.mode = '${TransactionModeType.debit}' THEN t.amount ELSE 0 END), 0)`,
        "outflow",
      )
      .addSelect(
        `SUM(CASE WHEN t.mode = '${TransactionModeType.credit}' THEN 1 ELSE 0 END)`,
        "inflow_count",
      )
      .addSelect(
        `SUM(CASE WHEN t.mode = '${TransactionModeType.debit}' THEN 1 ELSE 0 END)`,
        "outflow_count",
      )
      .where("t.status = :status", { status: TransactionStatusType.success })
      .andWhere("t.created_at BETWEEN :start AND :end", { start, end })
      .groupBy("day")
      .orderBy("day", "DESC")
      .getRawMany();

    const series = rows.map((r) => {
      const inflow = Number(r.inflow) || 0;
      const outflow = Number(r.outflow) || 0;
      return {
        day: r.day,
        inflow,
        outflow,
        net: inflow - outflow,
        inflow_count: Number(r.inflow_count) || 0,
        outflow_count: Number(r.outflow_count) || 0,
      };
    });

    const totalInflow = series.reduce((s, r) => s + r.inflow, 0);
    const totalOutflow = series.reduce((s, r) => s + r.outflow, 0);

    return {
      date_from: start.toISOString(),
      date_to: end.toISOString(),
      series,
      total_inflow: totalInflow,
      total_outflow: totalOutflow,
      net: totalInflow - totalOutflow,
    };
  }

  /**
   * Crypto deposit analytics for a date range (defaults to the last month):
   * which coins came in and how much, plus the biggest depositors.
   *
   * Counts only successful credit transactions of type `deposit` — the
   * deposit-fee debits and fiat movements are deliberately excluded.
   */
  async cryptoDeposits(dateFrom?: string, dateTo?: string) {
    const start = dateFrom ? new Date(dateFrom) : new Date();
    if (!dateFrom) start.setMonth(start.getMonth() - 1);
    start.setHours(0, 0, 0, 0);

    const end = dateTo ? new Date(dateTo) : new Date();
    end.setHours(23, 59, 59, 999);

    const base = () =>
      this.transactionsRepository
        .createQueryBuilder("t")
        .where("t.entity_type = :type", {
          type: TransactionEntityType.deposit,
        })
        .andWhere("t.mode = :mode", { mode: TransactionModeType.credit })
        .andWhere("t.status = :status", {
          status: TransactionStatusType.success,
        })
        .andWhere("t.created_at BETWEEN :start AND :end", { start, end });

    // Ranking by coin. Coin amounts only sum meaningfully per-currency, so
    // ordering is by dollar value, which is comparable across coins.
    const byCurrencyRows = await base()
      .select("UPPER(t.currency)", "currency")
      .addSelect("COUNT(*)", "deposit_count")
      .addSelect("COUNT(DISTINCT t.user_id)", "depositor_count")
      .addSelect("COALESCE(SUM(t.coin_amount), 0)", "coin_amount")
      .addSelect("COALESCE(SUM(t.dollar_amount), 0)", "dollar_amount")
      .addSelect("COALESCE(SUM(t.amount), 0)", "naira_amount")
      .groupBy("UPPER(t.currency)")
      .orderBy("dollar_amount", "DESC")
      .getRawMany();

    const byCurrency = byCurrencyRows.map((r) => ({
      currency: r.currency,
      deposit_count: Number(r.deposit_count) || 0,
      depositor_count: Number(r.depositor_count) || 0,
      coin_amount: Number(r.coin_amount) || 0,
      dollar_amount: Number(r.dollar_amount) || 0,
      naira_amount: Number(r.naira_amount) || 0,
    }));

    // Same slice broken down by coin AND network, for chain-level detail.
    const byNetworkRows = await base()
      .select("UPPER(t.currency)", "currency")
      .addSelect("COALESCE(UPPER(t.network), 'UNKNOWN')", "network")
      .addSelect("COUNT(*)", "deposit_count")
      .addSelect("COALESCE(SUM(t.coin_amount), 0)", "coin_amount")
      .addSelect("COALESCE(SUM(t.dollar_amount), 0)", "dollar_amount")
      .groupBy("UPPER(t.currency)")
      .addGroupBy("COALESCE(UPPER(t.network), 'UNKNOWN')")
      .orderBy("dollar_amount", "DESC")
      .getRawMany();

    // Biggest depositors — the first row is the top depositor for the range.
    const topDepositorRows = await base()
      .innerJoin("t.user", "u")
      .select("u.id", "user_id")
      .addSelect("u.first_name", "first_name")
      .addSelect("u.last_name", "last_name")
      .addSelect("u.email", "email")
      .addSelect("COUNT(*)", "deposit_count")
      .addSelect("COALESCE(SUM(t.dollar_amount), 0)", "dollar_amount")
      .addSelect("COALESCE(SUM(t.amount), 0)", "naira_amount")
      .groupBy("u.id")
      .addGroupBy("u.first_name")
      .addGroupBy("u.last_name")
      .addGroupBy("u.email")
      .orderBy("dollar_amount", "DESC")
      .limit(20)
      .getRawMany();

    const topDepositors = topDepositorRows.map((r) => ({
      user_id: r.user_id,
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email,
      deposit_count: Number(r.deposit_count) || 0,
      dollar_amount: Number(r.dollar_amount) || 0,
      naira_amount: Number(r.naira_amount) || 0,
    }));

    return {
      date_from: start.toISOString(),
      date_to: end.toISOString(),
      by_currency: byCurrency,
      by_network: byNetworkRows.map((r) => ({
        currency: r.currency,
        network: r.network,
        deposit_count: Number(r.deposit_count) || 0,
        coin_amount: Number(r.coin_amount) || 0,
        dollar_amount: Number(r.dollar_amount) || 0,
      })),
      top_depositors: topDepositors,
      top_depositor: topDepositors[0] ?? null,
      total_deposits: byCurrency.reduce((s, r) => s + r.deposit_count, 0),
      total_dollar_amount: byCurrency.reduce((s, r) => s + r.dollar_amount, 0),
      total_naira_amount: byCurrency.reduce((s, r) => s + r.naira_amount, 0),
    };
  }

  /** Total volume time series (successful transactions). */
  async volumeSeries(granularity: VolumeGranularity) {
    const trunc =
      granularity === "daily"
        ? "day"
        : granularity === "weekly"
          ? "week"
          : granularity === "monthly"
            ? "month"
            : "year";

    const windowStart = new Date();
    if (granularity === "daily")
      windowStart.setDate(windowStart.getDate() - 30);
    else if (granularity === "weekly")
      windowStart.setDate(windowStart.getDate() - 7 * 12);
    else if (granularity === "monthly")
      windowStart.setFullYear(windowStart.getFullYear() - 1);
    else windowStart.setFullYear(windowStart.getFullYear() - 10);

    const rows = await this.transactionsRepository
      .createQueryBuilder("t")
      .select(`DATE_TRUNC('${trunc}', t.created_at)`, "bucket")
      .addSelect("COUNT(*)", "count")
      .addSelect("COALESCE(SUM(t.amount), 0)", "volume")
      .addSelect(
        `COALESCE(SUM(CASE WHEN t.mode = '${TransactionModeType.credit}' THEN t.amount ELSE 0 END), 0)`,
        "credit_volume",
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN t.mode = '${TransactionModeType.debit}' THEN t.amount ELSE 0 END), 0)`,
        "debit_volume",
      )
      .where("t.status = :status", { status: TransactionStatusType.success })
      .andWhere("t.created_at >= :start", { start: windowStart })
      .groupBy("bucket")
      .orderBy("bucket", "ASC")
      .getRawMany();

    const series = rows.map((r) => ({
      bucket: r.bucket,
      count: Number(r.count) || 0,
      volume: Number(r.volume) || 0,
      credit_volume: Number(r.credit_volume) || 0,
      debit_volume: Number(r.debit_volume) || 0,
    }));

    return {
      granularity,
      series,
      total_volume: series.reduce((s, r) => s + r.volume, 0),
      total_count: series.reduce((s, r) => s + r.count, 0),
    };
  }

  async dailyUsers(days = 31, dateFrom?: string, dateTo?: string) {
    // Same contract as the KYC funnel: the start can be any date, but the
    // span is capped and a wider range is refused rather than silently
    // narrowed — a clamped range returns data the user did not ask for.
    const MAX_DAYS = 31;

    const end = dateTo ? new Date(dateTo) : new Date();
    end.setHours(23, 59, 59, 999);

    // `days` counts the window inclusively, so today plus the previous 29 is
    // 30 days. Subtracting the full count would produce 31 and fall foul of
    // the check below.
    const defaultDays = Math.min(days, MAX_DAYS);
    const start = dateFrom ? new Date(dateFrom) : new Date(end);
    if (!dateFrom) start.setDate(start.getDate() - (defaultDays - 1));
    start.setHours(0, 0, 0, 0);

    if (start > end) {
      throw new BadRequestException("Start date cannot be after the end date");
    }

    // Counted midnight to midnight, since `end` sits at 23:59:59.999 and
    // measuring against it directly would add a spurious day.
    const endOfRangeDay = new Date(end);
    endOfRangeDay.setHours(0, 0, 0, 0);

    const spanDays =
      Math.round((endOfRangeDay.getTime() - start.getTime()) / 86_400_000) + 1;
    if (spanDays > MAX_DAYS) {
      throw new BadRequestException(
        `Please select a range of ${MAX_DAYS} days or less`,
      );
    }

    const activity = await this.transactionsRepository
      .createQueryBuilder("t")
      .select(localDayBucket("t.created_at"), "day")
      .addSelect("COUNT(DISTINCT t.user_id)", "active_users")
      .addSelect("COUNT(*)", "transactions")
      .where("t.created_at >= :start", { start })
      .andWhere("t.created_at <= :end", { end })
      .groupBy("day")
      .orderBy("day", "ASC")
      .getRawMany();

    const signups = await this.userRepository
      .createQueryBuilder("u")
      .select(localDayBucket("u.created_at"), "day")
      .addSelect("COUNT(*)", "signups")
      .where("u.created_at >= :start", { start })
      .andWhere("u.created_at <= :end", { end })
      .groupBy("day")
      .orderBy("day", "ASC")
      .getRawMany();

    // Users who received money that day — the daily counterpart of the
    // "funded accounts" total.
    const funded = await this.transactionsRepository
      .createQueryBuilder("t")
      .select(localDayBucket("t.created_at"), "day")
      .addSelect("COUNT(DISTINCT t.user_id)", "funded_users")
      .where("t.created_at >= :start", { start })
      .andWhere("t.created_at <= :end", { end })
      .andWhere("t.status = :status", { status: TransactionStatusType.success })
      .andWhere("t.mode = :mode", { mode: TransactionModeType.credit })
      .groupBy("day")
      .orderBy("day", "ASC")
      .getRawMany();

    const activityByDay = new Map(activity.map((a) => [a.day as string, a]));
    const signupsByDay = new Map(
      signups.map((s) => [s.day as string, Number(s.signups)]),
    );
    const fundedByDay = new Map(
      funded.map((f) => [f.day as string, Number(f.funded_users)]),
    );

    const series: {
      day: Date;
      active_users: number;
      transactions: number;
      signups: number;
      funded_users: number;
    }[] = [];

    const lastDay = new Date(end);
    lastDay.setHours(0, 0, 0, 0);

    for (
      const day = new Date(start);
      day <= lastDay;
      day.setDate(day.getDate() + 1)
    ) {
      const key = localDayKey(day);
      const found = activityByDay.get(key);
      series.push({
        day: new Date(day),
        active_users: Number(found?.active_users) || 0,
        transactions: Number(found?.transactions) || 0,
        signups: signupsByDay.get(key) ?? 0,
        funded_users: fundedByDay.get(key) ?? 0,
      });
    }

    return { days, series, date_from: start, date_to: end };
  }

  /**
   * Registration cohort funnel.
   *
   * The window comes from one of three places, in priority order: an explicit
   * date range, a calendar period preset, or the default last 31 days.
   */
  async kycFunnel(
    dateFrom?: string,
    dateTo?: string,
    period?: AnalyticsPeriod | "all",
  ) {
    const MAX_DAYS = 31;

    let start: Date | null;
    let end: Date | null;

    if (dateFrom || dateTo) {
      end = dateTo ? new Date(dateTo) : new Date();
      end.setHours(23, 59, 59, 999);

      start = dateFrom ? new Date(dateFrom) : new Date(end);
      if (!dateFrom) start.setDate(start.getDate() - (MAX_DAYS - 1));
      start.setHours(0, 0, 0, 0);

      if (start > end) {
        throw new BadRequestException(
          "Start date cannot be after the end date",
        );
      }

      // Counted midnight to midnight — `end` sits at 23:59:59.999, so
      // measuring against it directly would add a spurious day.
      const endOfRangeDay = new Date(end);
      endOfRangeDay.setHours(0, 0, 0, 0);

      // Inclusive of both bounds, so the 1st to the 31st is exactly 31 days.
      const spanDays =
        Math.round((endOfRangeDay.getTime() - start.getTime()) / 86_400_000) +
        1;
      if (spanDays > MAX_DAYS) {
        throw new BadRequestException(
          `Please select a range of ${MAX_DAYS} days or less`,
        );
      }
    } else if (period === "all") {
      start = null;
      end = null;
    } else if (period) {
      start = periodStart(period);
      end = new Date();
      end.setHours(23, 59, 59, 999);
    } else {
      end = new Date();
      end.setHours(23, 59, 59, 999);
      start = new Date(end);
      start.setDate(start.getDate() - (MAX_DAYS - 1));
      start.setHours(0, 0, 0, 0);
    }

    const applyRange = <T extends ObjectLiteral>(
      qb: SelectQueryBuilder<T>,
      alias: string,
    ) => {
      if (start) qb.andWhere(`${alias}.created_at >= :start`, { start });
      if (end) qb.andWhere(`${alias}.created_at <= :end`, { end });
      return qb;
    };

    const total = await applyRange(
      this.userRepository.createQueryBuilder("u"),
      "u",
    ).getCount();

    const emailVerified = await applyRange(
      this.userRepository
        .createQueryBuilder("u")
        .where("u.email_verified_at IS NOT NULL"),
      "u",
    ).getCount();

    const byKyc = await applyRange(
      this.userRepository
        .createQueryBuilder("u")
        .select("u.kyc_status", "kyc_status")
        .addSelect("COUNT(*)", "count")
        .groupBy("u.kyc_status"),
      "u",
    ).getRawMany();

    const kyc: Record<string, number> = {};
    for (const row of byKyc) {
      kyc[row.kyc_status ?? "none"] = Number(row.count) || 0;
    }

    const countUsersWithTransactionType = async (
      types: TransactionEntityType[],
    ) => {
      const row = await applyRange(
        this.transactionsRepository
          .createQueryBuilder("t")
          .innerJoin("t.user", "u")
          .select("COUNT(DISTINCT t.user_id)", "count")
          .where("t.entity_type IN (:...types)", { types })
          .andWhere("t.status = :status", {
            status: TransactionStatusType.success,
          }),
        "u",
      ).getRawOne();
      return Number(row.count) || 0;
    };

    const firstDeposit = await countUsersWithTransactionType([
      TransactionEntityType.deposit,
    ]);
    const firstTrade = await countUsersWithTransactionType([
      TransactionEntityType.withdrawal,
      TransactionEntityType.airtime,
      TransactionEntityType.data,
      TransactionEntityType.electricity_bill,
      TransactionEntityType.tv_subscription,
    ]);

    return {
      registered: total,
      email_verified: emailVerified,
      kyc_verified: kyc[KycStatus.success] ?? 0,
      kyc_pending: total - (kyc[KycStatus.success] ?? 0),
      first_deposit: firstDeposit,
      first_trade: firstTrade,
      kyc_breakdown: kyc,
      date_from: start,
      date_to: end,
    };
  }

  /** Where users are, and where transaction volume comes from. */
  async userLocations() {
    const users = await this.userRepository
      .createQueryBuilder("u")
      .select("COALESCE(NULLIF(TRIM(u.country), ''), 'Unknown')", "country")
      .addSelect("COALESCE(NULLIF(TRIM(u.state), ''), 'Unknown')", "state")
      .addSelect("COUNT(*)", "users")
      .groupBy("country")
      .addGroupBy("state")
      .orderBy("users", "DESC")
      .getRawMany();

    const volumeByCountry = await this.transactionsRepository
      .createQueryBuilder("t")
      .innerJoin("t.user", "u")
      .select("COALESCE(NULLIF(TRIM(u.country), ''), 'Unknown')", "country")
      .addSelect("COUNT(*)", "transactions")
      .addSelect("COALESCE(SUM(t.amount), 0)", "volume")
      .where("t.status = :status", { status: TransactionStatusType.success })
      .groupBy("country")
      .orderBy("volume", "DESC")
      .getRawMany();

    return {
      users: users.map((r) => ({ ...r, users: Number(r.users) || 0 })),
      transaction_volume_by_country: volumeByCountry.map((r) => ({
        ...r,
        transactions: Number(r.transactions) || 0,
        volume: Number(r.volume) || 0,
      })),
    };
  }
}
