import {
  REFERRAL_CODE_LENGTH,
  REFERRAL_QUALIFYING_DEPOSIT_USD,
  REFERRAL_REWARD_NGN,
} from "@/constants";
import {
  generateMasamasaRef,
  generateReferralCode,
} from "@/core/helpers/generateAlphaNumericString";
import { paginate } from "@/core/helpers/paginate";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { NotificationTag } from "../notifications/entities/notification.entity";
import { NotificationsService } from "../notifications/notifications.service";
import {
  Transactions,
  TransactionEntityType,
  TransactionModeType,
  TransactionStatusType,
} from "../transactions/transactions.entity";
import { User } from "../users/entities/user.entity";
import { ReferralEarning } from "./entities/referral-earning.entity";

/** Postgres unique-violation. */
const PG_UNIQUE_VIOLATION = "23505";

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ReferralEarning)
    private readonly earningRepository: Repository<ReferralEarning>,
    @InjectRepository(Transactions)
    private readonly transactionsRepository: Repository<Transactions>,
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
  ) {}

  // ─── CODES ─────────────────────────────────────────────────────────────────

  /**
   * A referral code not already taken.
   *
   * The unique index is the real guarantee — this only keeps the odds of the
   * insert failing low. Callers that write the code must still be prepared for
   * a unique violation, since another signup can claim the same draw in the
   * window between this check and their insert.
   */
  async generateUniqueCode(manager?: EntityManager): Promise<string> {
    const repo = manager ? manager.getRepository(User) : this.userRepository;

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateReferralCode(REFERRAL_CODE_LENGTH);
      const taken = await repo.exists({ where: { referral_code: code } });
      if (!taken) return code;
    }

    // Five collisions in a 27-billion keyspace means something is wrong with
    // the generator, not bad luck. Fail loudly rather than loop forever.
    throw new Error("Could not generate a unique referral code");
  }

  /**
   * Resolves a referral code typed at signup to the referrer's id.
   *
   * Throws on an unrecognised code rather than silently ignoring it: the user
   * typed it deliberately, and quietly dropping it would cost their referrer a
   * reward with nothing to show why.
   */
  async resolveReferrer(
    code: string | null | undefined,
    manager?: EntityManager,
  ): Promise<number | null> {
    const normalised = (code ?? "").trim().toUpperCase();
    if (!normalised) return null;

    const repo = manager ? manager.getRepository(User) : this.userRepository;
    const referrer = await repo.findOne({
      where: { referral_code: normalised },
      select: ["id"],
    });

    if (!referrer) {
      throw new BadRequestException("That referral code is not valid.");
    }
    return referrer.id;
  }

  /**
   * The caller's own code, generating one if the account somehow has none.
   *
   * Signup assigns a code and the migration backfilled every existing account,
   * so this should never have to generate — but a user with no code has
   * nothing to share, and a lazy repair is cheaper than a support ticket.
   */
  private async ensureReferralCode(user: User): Promise<string> {
    if (user.referral_code) return user.referral_code;

    const code = await this.generateUniqueCode();
    await this.userRepository.update({ id: user.id }, { referral_code: code });
    this.logger.warn(`Backfilled a missing referral code for user ${user.id}`);
    return code;
  }

  // ─── QUALIFICATION ─────────────────────────────────────────────────────────

  /** Lifetime value of a user's confirmed deposits, in USD. */
  private async lifetimeDepositUsd(userId: number): Promise<number> {
    const result = await this.transactionsRepository
      .createQueryBuilder("transaction")
      .select("COALESCE(SUM(transaction.dollar_amount), 0)", "total")
      .where("transaction.user_id = :userId", { userId })
      .andWhere("transaction.entity_type = :type", {
        type: TransactionEntityType.deposit,
      })
      .andWhere("transaction.mode = :mode", {
        mode: TransactionModeType.credit,
      })
      .andWhere("transaction.status = :status", {
        status: TransactionStatusType.success,
      })
      .getRawOne();

    return parseFloat(result?.total) || 0;
  }

  async evaluateQualification(refereeId: number): Promise<void> {
    try {
      const referee = await this.userRepository.findOne({
        where: { id: refereeId },
        select: ["id", "first_name", "last_name", "referred_by_id"],
      });

      if (!referee?.referred_by_id) return;

      const alreadyPaid = await this.earningRepository.exists({
        where: { user_id: referee.referred_by_id, referee_id: referee.id },
      });
      if (alreadyPaid) return;

      const depositedUsd = await this.lifetimeDepositUsd(referee.id);
      if (depositedUsd < REFERRAL_QUALIFYING_DEPOSIT_USD) return;

      await this.earningRepository.insert({
        user_id: referee.referred_by_id,
        referee_id: referee.id,
        amount: REFERRAL_REWARD_NGN,
        withdrawal_status: false,
      });

      this.logger.log(
        `Referral reward awarded — referrer ${referee.referred_by_id}, referee ${referee.id}`,
      );

      this.notificationsService
        .create({
          userId: referee.referred_by_id,
          message:
            `You earned ₦${REFERRAL_REWARD_NGN.toLocaleString("en-NG")} — ` +
            `someone you referred hit $${REFERRAL_QUALIFYING_DEPOSIT_USD.toLocaleString("en-NG")} in deposits.`,
          tag: NotificationTag.referral_bonus,
          pushTitle: "Referral bonus earned",
          metadata: { referee_id: referee.id, amount: REFERRAL_REWARD_NGN },
        })
        .catch(() => {});
    } catch (error) {
      // The unique index caught a concurrent award — the reward was paid by
      // the other request, so there is nothing to report.
      const driverError = error as { code?: string };
      if (driverError?.code === PG_UNIQUE_VIOLATION) return;

      const failure = error as Error;
      this.logger.error(
        `Referral qualification check failed for user ${refereeId}: ${failure?.message}`,
        failure?.stack,
      );
    }
  }

  async awardMissedQualifications(): Promise<number> {
    const candidates: { referee_id: number }[] = await this.userRepository
      .createQueryBuilder("user")
      .select("user.id", "referee_id")
      .leftJoin(
        ReferralEarning,
        "earning",
        "earning.user_id = user.referred_by_id AND earning.referee_id = user.id",
      )
      .where("user.referred_by_id IS NOT NULL")
      .andWhere("earning.id IS NULL")
      .andWhere(
        `(
          SELECT COALESCE(SUM(t.dollar_amount), 0) FROM transactions t
          WHERE t.user_id = user.id
            AND t.entity_type = :depositType
            AND t.mode = :credit
            AND t.status = :success
        ) >= :threshold`,
      )
      .setParameters({
        depositType: TransactionEntityType.deposit,
        credit: TransactionModeType.credit,
        success: TransactionStatusType.success,
        threshold: REFERRAL_QUALIFYING_DEPOSIT_USD,
      })
      .getRawMany();

    // Routed back through evaluateQualification rather than inserting here, so
    // there is exactly one code path that awards a reward — one place that
    // notifies, and one place that handles the duplicate-insert race.
    for (const { referee_id } of candidates) {
      await this.evaluateQualification(referee_id);
    }

    if (candidates.length > 0) {
      this.logger.warn(
        `Awarded ${candidates.length} referral reward(s) missed by the deposit hooks`,
      );
    }
    return candidates.length;
  }

  // ─── READS ─────────────────────────────────────────────────────────────────

  /** Everything the Refer & Earn screen renders, in one call. */
  async summary(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    const referralCode = await this.ensureReferralCode(user);

    const [referees, earnings] = await Promise.all([
      this.userRepository.find({
        where: { referred_by_id: userId },
        select: [
          "id",
          "first_name",
          "last_name",
          "profile_image",
          "created_at",
        ],
        order: { created_at: "DESC" },
      }),
      this.earningRepository.find({ where: { user_id: userId } }),
    ]);

    // Which referees have already earned, so each can be labelled without a
    // per-referee query.
    const paidRefereeIds = new Set(earnings.map((e) => e.referee_id));

    const totalEarned = earnings.reduce((sum, e) => sum + Number(e.amount), 0);
    const available = earnings
      .filter((e) => !e.withdrawal_status)
      .reduce((sum, e) => sum + Number(e.amount), 0);

    return {
      referral_code: referralCode,
      reward_per_referral: REFERRAL_REWARD_NGN,
      qualifying_deposit_usd: REFERRAL_QUALIFYING_DEPOSIT_USD,
      total_earned: totalEarned,
      available_to_withdraw: available,
      total_withdrawn: totalEarned - available,
      total_referrals: referees.length,
      referrals: referees.map((referee) => ({
        id: referee.id,
        first_name: referee.first_name,
        last_name: referee.last_name,
        profile_image: referee.profile_image ?? null,
        joined_at: referee.created_at,
        // "earned" once the reward exists; everyone else is still working
        // toward the deposit threshold.
        status: paidRefereeIds.has(referee.id) ? "earned" : "pending",
        amount: paidRefereeIds.has(referee.id) ? REFERRAL_REWARD_NGN : 0,
      })),
    };
  }

  /** Paginated reward history — the "View history" list. */
  async earnings(userId: number, page = 1, limit = 20) {
    const [records, total] = await this.earningRepository.findAndCount({
      where: { user_id: userId },
      relations: ["referee"],
      order: { created_at: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: records.map((record) => ({
        id: record.id,
        amount: Number(record.amount),
        withdrawal_status: record.withdrawal_status,
        withdrawn_at: record.withdrawn_at,
        created_at: record.created_at,
        referee: record.referee
          ? {
              id: record.referee.id,
              first_name: record.referee.first_name,
              last_name: record.referee.last_name,
            }
          : null,
      })),
      meta: paginate(total, page, limit),
    };
  }

  // ─── WITHDRAWAL ────────────────────────────────────────────────────────────

  /**
   * Moves everything in the earning account into the main balance.
   *
   * Whole-balance only: a reward is a row, and a row is either withdrawn or it
   * is not, so a partial amount could not be represented without splitting a
   * reward in half. See the note on [ReferralEarning].
   *
   * The row lock matters here as much as it does for a debit — two taps of the
   * withdraw button arriving together would otherwise both read the same
   * un-withdrawn rows and each credit the main balance, paying the reward twice.
   */
  async withdrawToMainAccount(userId: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock the un-withdrawn rows themselves, not the user — the rows are
      // what is being spent, and a concurrent request must wait for them.
      const pending = await queryRunner.manager
        .createQueryBuilder(ReferralEarning, "earning")
        .setLock("pessimistic_write")
        .where("earning.user_id = :userId", { userId })
        .andWhere("earning.withdrawal_status = :withdrawn", {
          withdrawn: false,
        })
        .getMany();

      if (pending.length === 0) {
        throw new BadRequestException(
          "You have no referral earnings to withdraw.",
        );
      }

      const amount = pending.reduce((sum, e) => sum + Number(e.amount), 0);
      const withdrawnAt = new Date();

      await queryRunner.manager
        .createQueryBuilder()
        .update(ReferralEarning)
        .set({ withdrawal_status: true, withdrawn_at: withdrawnAt })
        .whereInIds(pending.map((e) => e.id))
        .execute();

      // The credit that makes the money spendable. Same shape as every other
      // main-balance credit, so it shows up in transaction history and in the
      // balance sum with no special-casing anywhere.
      const transaction = await queryRunner.manager.save(
        queryRunner.manager.create(Transactions, {
          user_id: userId,
          network: null,
          coin_amount: 0,
          wallet_address: null,
          mode: TransactionModeType.credit,
          entity_type: TransactionEntityType.referral_earning,
          metadata: {
            note: "Referral earnings moved to main balance",
            earning_ids: pending.map((e) => e.id),
            referral_count: pending.length,
          },
          exchange_rate_id: null,
          currency: "NGN",
          entity_id: pending[0].id,
          dollar_amount: 0,
          amount,
          coin_exchange_rate: 0,
          masamasa_ref: generateMasamasaRef(),
          status: TransactionStatusType.success,
        } as unknown as Transactions),
      );

      await queryRunner.commitTransaction();

      // Fire-and-forget for the same reason: the money has already moved.
      this.notificationsService
        .create({
          userId,
          message: `₦${amount.toLocaleString("en-NG")} from your referral earnings is now in your main balance.`,
          tag: NotificationTag.wallet_credit,
          pushTitle: "Referral earnings withdrawn",
          metadata: { amount, reference: transaction.masamasa_ref },
        })
        .catch(() => {});

      return {
        amount,
        referrals_settled: pending.length,
        reference: transaction.masamasa_ref,
        message: `₦${amount.toLocaleString("en-NG")} moved to your main account.`,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
