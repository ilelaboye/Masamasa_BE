import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { KycStatus, Status, User } from "@/modules/users/entities/user.entity";
import {
  TransactionEntityType,
  TransactionModeType,
  Transactions,
  TransactionStatusType,
} from "@/modules/transactions/transactions.entity";
import { PurchaseRequest } from "@/modules/purchases/entities/purchases.entity";
import { paginate } from "@/core/helpers";

export type AnalyticsPeriod = "today" | "week" | "month" | "year";
export type VolumeGranularity = "daily" | "weekly" | "monthly" | "yearly";

/** Start date for a rolling analytics period. */
function periodStart(period: AnalyticsPeriod): Date {
  const now = new Date();
  switch (period) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    case "month": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return d;
    }
    case "year": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return d;
    }
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

  /** Headline numbers for the analytics overview cards. */
  async overview() {
    const startOfToday = periodStart("today");

    const todayTx = await this.transactionsRepository
      .createQueryBuilder("t")
      .select("COUNT(*)", "count")
      .addSelect("COALESCE(SUM(t.amount), 0)", "volume")
      .where("t.created_at >= :start", { start: startOfToday })
      .andWhere("t.status = :status", {
        status: TransactionStatusType.success,
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

    const totalUsers = await this.userRepository.count();
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
      pending_kyc: pendingKyc,
    };
  }

  /** Transactions per user for a rolling period, heaviest users first. */
  async transactionsPerUser(
    period: AnalyticsPeriod,
    page = 1,
    limit = 20,
  ) {
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
    if (granularity === "daily") windowStart.setDate(windowStart.getDate() - 30);
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

  /** Daily active (transacting) users + signups for the last N days. */
  async dailyUsers(days = 30) {
    const start = new Date();
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);

    const activity = await this.transactionsRepository
      .createQueryBuilder("t")
      .select(`DATE_TRUNC('day', t.created_at)`, "day")
      .addSelect("COUNT(DISTINCT t.user_id)", "active_users")
      .addSelect("COUNT(*)", "transactions")
      .where("t.created_at >= :start", { start })
      .groupBy("day")
      .orderBy("day", "ASC")
      .getRawMany();

    const signups = await this.userRepository
      .createQueryBuilder("u")
      .select(`DATE_TRUNC('day', u.created_at)`, "day")
      .addSelect("COUNT(*)", "signups")
      .where("u.created_at >= :start", { start })
      .groupBy("day")
      .orderBy("day", "ASC")
      .getRawMany();

    const signupsByDay = new Map(
      signups.map((s) => [new Date(s.day).toISOString(), Number(s.signups)]),
    );

    return {
      days,
      series: activity.map((a) => ({
        day: a.day,
        active_users: Number(a.active_users) || 0,
        transactions: Number(a.transactions) || 0,
        signups: signupsByDay.get(new Date(a.day).toISOString()) ?? 0,
      })),
    };
  }

  /**
   * Registration → verification → KYC funnel. App-store download counts are
   * only available in the Play/App Store consoles — the funnel starts at
   * registration.
   */
  async kycFunnel() {
    const total = await this.userRepository.count();
    const emailVerified = await this.userRepository
      .createQueryBuilder("u")
      .where("u.email_verified_at IS NOT NULL")
      .getCount();

    const byKyc = await this.userRepository
      .createQueryBuilder("u")
      .select("u.kyc_status", "kyc_status")
      .addSelect("COUNT(*)", "count")
      .groupBy("u.kyc_status")
      .getRawMany();

    const kyc: Record<string, number> = {};
    for (const row of byKyc) {
      kyc[row.kyc_status ?? "none"] = Number(row.count) || 0;
    }

    return {
      registered: total,
      email_verified: emailVerified,
      kyc_verified: kyc[KycStatus.success] ?? 0,
      // Everyone who has not completed KYC (total − verified)
      kyc_pending: total - (kyc[KycStatus.success] ?? 0),
      kyc_breakdown: kyc,
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
