import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, Repository } from "typeorm";
import { appConfig } from "@/config";
import { AdminRequest } from "@/definitions";
import { getRequestQuery, sendAffiliateInviteEmail } from "@/core/utils";
import { paginate } from "@/core/helpers";
import { KycStatus, User } from "../users/entities/user.entity";
import {
  TransactionEntityType,
  TransactionModeType,
  TransactionStatusType,
} from "../transactions/transactions.entity";
import { ReferralEarning } from "../referrals/entities/referral-earning.entity";
import { AdminLogEntities } from "../administrator/entities/admin-logs.entity";
import {
  isAnalyticsPeriod,
  periodStart,
} from "../administrator/services/analytics.service";
import { AdministratorService } from "../administrator/services/administrator.service";
import { Affiliate, AffiliateStatus } from "./entities/affiliate.entity";
import { CreateAffiliateDto } from "./dto/affiliate.dto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class AffiliatesService {
  constructor(
    @InjectRepository(Affiliate)
    private readonly affiliateRepository: Repository<Affiliate>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(ReferralEarning)
    private readonly earningRepository: Repository<ReferralEarning>,

    private readonly administratorService: AdministratorService,
  ) {}

  async createAffiliate(
    createAffiliateDto: CreateAffiliateDto,
    req: AdminRequest,
  ) {
    if (!createAffiliateDto.user_ids?.length) {
      throw new BadRequestException("User is required");
    }
    const userIds = [...new Set(createAffiliateDto.user_ids)];

    // Kept from the check loop so the welcome email has a name and an address
    // without looking the same users up a second time.
    const users: User[] = [];

    for (const user_id of userIds) {
      const user = await this.userRepository.findOne({
        where: { id: user_id },
      });
      if (!user) {
        throw new BadRequestException(`No account found with id ${user_id}`);
      }
      users.push(user);

      const existing = await this.affiliateRepository.findOne({
        where: { user_id },
        withDeleted: true,
      });
      if (existing) {
        throw new BadRequestException(
          existing.deleted_at
            ? `User ${user_id} was removed as an affiliate`
            : `User ${user_id} is already an affiliate`,
        );
      }
    }

    for (const user of users) {
      const affiliate = await this.affiliateRepository.save(
        this.affiliateRepository.create({
          user_id: user.id,
          admin_id: req.admin.id,
        }),
      );

      // The uuid is the link — it comes back from the insert, so the email can
      // only be built here.
      sendAffiliateInviteEmail(user, {
        dashboardLink: `${appConfig.AFFILIATE_FRONTEND}/affiliate/${affiliate.uuid}`,
        referralCode: user.referral_code,
        referralLink: `${appConfig.REFERRAL_LINK_BASE}/${user.referral_code}`,
      });
    }

    const msg = `${req.admin.first_name} ${req.admin.last_name} made user(s) ${userIds.join(", ")} an affiliate`;
    await this.administratorService.createAdminLog(
      null,
      req.admin,
      AdminLogEntities.AFFILIATE,
      msg,
    );

    return {
      message: `${userIds.length} affiliate(s) created successfully`,
    };
  }

  async getAffiliates(req: AdminRequest) {
    const { limit, page, skip, search, status } = getRequestQuery(req);

    const queryRunner = this.affiliateRepository
      .createQueryBuilder("affiliate")
      .leftJoinAndSelect("affiliate.user", "user")
      .leftJoin("affiliate.admin", "admin")
      .addSelect(["admin.first_name", "admin.last_name"]);

    if (
      status &&
      Object.values(AffiliateStatus).includes(status as AffiliateStatus)
    ) {
      queryRunner.andWhere("affiliate.status = :status", { status });
    }

    // Grouped, so the OR-chain cannot escape the status filter above.
    if (search) {
      queryRunner.andWhere(
        new Brackets((qb) => {
          qb.where("user.first_name ILIKE :search", { search: `%${search}%` })
            .orWhere("user.last_name ILIKE :search", { search: `%${search}%` })
            .orWhere("user.email ILIKE :search", { search: `%${search}%` })
            .orWhere("user.username ILIKE :search", { search: `%${search}%` })
            .orWhere(
              "CONCAT(user.first_name, ' ', user.last_name) ILIKE :search",
              { search: `%${search}%` },
            );
        }),
      );
    }

    const count = await queryRunner.getCount();
    const affiliates = await queryRunner
      .orderBy("affiliate.created_at", "DESC")
      .skip(skip)
      .take(limit)
      .getMany();

    // Table columns: how many people each affiliate brought in, and what they
    // have earned. Two grouped queries for the whole page, not two per row.
    const userIds = affiliates.map((affiliate) => affiliate.user_id);

    const referrals = userIds.length
      ? await this.userRepository
          .createQueryBuilder("user")
          .select("user.referred_by_id", "user_id")
          .addSelect("COUNT(*)", "total")
          .where("user.referred_by_id IN (:...userIds)", { userIds })
          .groupBy("user.referred_by_id")
          .getRawMany()
      : [];

    const earnings = userIds.length
      ? await this.earningRepository
          .createQueryBuilder("earning")
          .select("earning.user_id", "user_id")
          .addSelect("COALESCE(SUM(earning.amount), 0)", "total")
          .where("earning.user_id IN (:...userIds)", { userIds })
          .groupBy("earning.user_id")
          .getRawMany()
      : [];

    const totalFor = (rows: { user_id: number; total: string }[], id: number) =>
      Number(rows.find((row) => row.user_id === id)?.total ?? 0);

    const metadata = paginate(count, page, limit);
    return {
      affiliates: affiliates.map((affiliate) => ({
        ...affiliate,
        referred_count: totalFor(referrals, affiliate.user_id),
        total_commission: totalFor(earnings, affiliate.user_id),
      })),
      metadata,
    };
  }

  async getAffiliate(uuid: string, requestedPeriod?: string) {
    const affiliate = await this.affiliateByUuid(uuid)
      .leftJoin("affiliate.admin", "admin")
      .addSelect(["admin.first_name", "admin.last_name"])
      .getOne();

    if (!affiliate) {
      throw new BadRequestException("Affiliate not found");
    }

    return {
      affiliate,
      ...(await this.buildReport(affiliate.user_id, requestedPeriod)),
    };
  }

  async getAffiliateReport(uuid: string, requestedPeriod?: string) {
    const affiliate = await this.affiliateByUuid(uuid)
      .andWhere("affiliate.status = :active", {
        active: AffiliateStatus.active,
      })
      .getOne();

    if (!affiliate) {
      throw new BadRequestException("Affiliate not found");
    }

    const { referred_users, period, kpi } = await this.buildReport(
      affiliate.user_id,
      requestedPeriod,
    );
    // Deposit figures are admin-only.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { deposit_volume, deposit_count, ...affiliateKpi } = kpi;

    return {
      affiliate: {
        first_name: affiliate.user.first_name,
        last_name: affiliate.user.last_name,
      },
      period,
      kpi: affiliateKpi,
      referred_users: referred_users.map((user) => ({
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        status: user.status,
        has_transacted: user.has_transacted,
        created_at: user.created_at,
      })),
    };
  }

  private affiliateByUuid(uuid: string) {
    if (!UUID_PATTERN.test(uuid)) {
      throw new BadRequestException("Affiliate not found");
    }

    return this.affiliateRepository
      .createQueryBuilder("affiliate")
      .leftJoinAndSelect("affiliate.user", "user")
      .where("affiliate.uuid = :uuid", { uuid });
  }

  private async buildReport(userId: number, requestedPeriod?: string) {
    const period = isAnalyticsPeriod(requestedPeriod) ? requestedPeriod : null;
    const periodFrom = period ? periodStart(period) : null;

    // The referred-users table is always all-time; the period only scopes the
    // KPIs, so each user carries both.
    const withinPeriod = periodFrom ? " AND t.created_at >= :periodFrom" : "";

    const depositWhere = `t.user_id = "user"."id"
        AND t.entity_type = :depositType
        AND t.mode = :credit
        AND t.status = :success`;

    const rows = await this.userRepository
      .createQueryBuilder("user")
      .select("user.id", "id")
      .addSelect("user.first_name", "first_name")
      .addSelect("user.last_name", "last_name")
      .addSelect("user.username", "username")
      .addSelect("user.email", "email")
      .addSelect("user.phone", "phone")
      .addSelect("user.status", "status")
      .addSelect("user.kyc_status", "kyc_status")
      .addSelect("user.kyc_tier", "kyc_tier")
      .addSelect("user.created_at", "created_at")

      .addSelect(
        `(SELECT COALESCE(SUM(t.amount), 0)
          FROM transactions t
          WHERE ${depositWhere})`,
        "deposit_volume",
      )
      .addSelect(
        `(SELECT COUNT(*)
          FROM transactions t
          WHERE ${depositWhere})`,
        "deposit_count",
      )

      .addSelect(
        `EXISTS (SELECT 1 FROM transactions t WHERE t.user_id = "user"."id")`,
        "has_transacted",
      )

      .addSelect(
        periodFrom ? `"user"."created_at" >= :periodFrom` : "TRUE",
        "registered_in_period",
      )
      .addSelect(
        `EXISTS (
          SELECT 1
          FROM transactions t
          WHERE t.user_id = "user"."id"${withinPeriod}
        )`,
        "transacted_in_period",
      )
      .addSelect(
        `(SELECT COALESCE(SUM(t.amount), 0)
          FROM transactions t
          WHERE ${depositWhere}${withinPeriod})`,
        "period_deposit_volume",
      )
      .addSelect(
        `(SELECT COUNT(*)
          FROM transactions t
          WHERE ${depositWhere}${withinPeriod})`,
        "period_deposit_count",
      )
      .where("user.referred_by_id = :userId", { userId })
      .setParameters({
        depositType: TransactionEntityType.deposit,
        credit: TransactionModeType.credit,
        success: TransactionStatusType.success,
        ...(periodFrom && { periodFrom }),
      })
      .orderBy("user.created_at", "DESC")
      .getRawMany();

    const referred_users = rows.map((user) => ({
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      status: user.status,
      kyc_status: user.kyc_status,
      kyc_tier: user.kyc_tier,
      created_at: user.created_at,
      deposit_volume: Number(user.deposit_volume),
      deposit_count: Number(user.deposit_count),
      has_transacted: user.has_transacted,
    }));

    const earnings = await this.earningRepository.find({
      where: { user_id: userId },
    });

    const commission = earnings
      .filter((earning) => !periodFrom || earning.created_at >= periodFrom)
      .reduce((total, earning) => total + Number(earning.amount), 0);

    const registered_users = rows.filter(
      (user) => user.registered_in_period,
    ).length;

    const transacting_users = rows.filter(
      (user) => user.transacted_in_period,
    ).length;

    // A current state rather than an event, so not scoped to the period.
    const pending_kyc = rows.filter(
      (user) => user.kyc_status === KycStatus.pending,
    ).length;

    const deposit_volume = rows.reduce(
      (total, user) => total + Number(user.period_deposit_volume),
      0,
    );

    const deposit_count = rows.reduce(
      (total, user) => total + Number(user.period_deposit_count),
      0,
    );

    return {
      referred_users,
      period,
      kpi: {
        registered_users,
        pending_kyc,
        transacting_users,
        commission,
        deposit_volume,
        deposit_count,
      },
    };
  }
}
