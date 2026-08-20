import { CacheService } from "@/modules/global/cache-container/cache-container.service";
import { MixpanelService } from "@/modules/global/mixpanel/mixpanel.service";
import { BadRequestException, Injectable } from "@nestjs/common";
import { appConfig } from "@/config";
import {
  Administrator,
  AdministratorRoles,
  AdminStatus,
} from "../entities/administrator.entity";
import { Brackets, Repository, SelectQueryBuilder } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { AdminLogEntities, AdminLogs } from "../entities/admin-logs.entity";
import { AdminRequest } from "@/definitions";
import {
  ChangeAdminPasswordDto,
  CreateExchangeRateDto,
  CreateStaffDto,
  DeclineKycDto,
  UpdateAdminProfileDto,
  UpdateStaffStatusDto,
} from "../dto/admin.dto";
import { ExchangeRateService } from "@/modules/exchange-rates/exchange-rates.service";
import { KycStatus, Status, User } from "@/modules/users/entities/user.entity";
import {
  endOfDay,
  getRequestQuery,
  hashResource,
  sendAccountStatusChangedEmail,
  sendStaffInviteEmail,
  verifyHash,
} from "@/core/utils";
import {
  capitalizeString,
  generateInviteToken,
  paginate,
} from "@/core/helpers";
import {
  TransactionEntityType,
  TransactionModeType,
  Transactions,
  TransactionStatusType,
} from "@/modules/transactions/transactions.entity";
import { WithdrawalWallet } from "@/modules/web3/entity/withdrawal-wallet.entity";

@Injectable()
export class AdministratorService {
  constructor(
    @InjectRepository(Administrator)
    private readonly adminRepository: Repository<Administrator>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AdminLogs)
    private readonly adminLogsRepository: Repository<AdminLogs>,
    @InjectRepository(Transactions)
    private readonly transactionsRepository: Repository<Transactions>,
    @InjectRepository(WithdrawalWallet)
    private readonly withdrawalWalletRepository: Repository<WithdrawalWallet>,
    private readonly cacheService: CacheService,
    private readonly exchangeRateService: ExchangeRateService,
    private readonly mixpanel: MixpanelService,
  ) {}

  async getWithId(id: string) {
    const cachedData = await this.cacheService.get<Administrator | undefined>(
      `admin:${id}`,
    );
    // console.log('fetched from cache', cachedData);
    if (cachedData) return cachedData;

    const admin = await this.adminRepository.findOne({
      where: { id: parseInt(id) },
    });
    if (admin) await this.cacheService.set(`admin:${id}`, admin);

    return admin;
  }

  async getProfile(req: AdminRequest) {
    const admin = { ...req.admin };
    return admin;
  }

  async updateProfile(
    updateAdminProfileDto: UpdateAdminProfileDto,
    req: AdminRequest,
  ) {
    const { id } = req.admin;

    await this.adminRepository.update(
      { id },
      {
        first_name: updateAdminProfileDto.first_name,
        last_name: updateAdminProfileDto.last_name,
        phone: updateAdminProfileDto.phone,
        address: updateAdminProfileDto.address,
      },
    );

    this.cacheService.del(`admin:${id}`);
    return await this.adminRepository.findOne({ where: { id } });
  }

  async changePassword(
    changeAdminPasswordDto: ChangeAdminPasswordDto,
    req: AdminRequest,
  ) {
    const { id } = req.admin;

    const admin = await this.adminRepository
      .createQueryBuilder("admin")
      .addSelect("admin.password")
      .where("admin.id = :id", { id })
      .getOne();

    if (!admin) {
      throw new BadRequestException("Admin not found, please login again");
    }

    // Only reachable by an account that never accepted its invite, which the
    // guards already block from logging in — defensive, not expected.
    if (!admin.password) {
      throw new BadRequestException(
        "This account has no password set. Complete your invite first.",
      );
    }

    const verified = await verifyHash(
      changeAdminPasswordDto.old_password,
      admin.password,
    );
    if (!verified)
      throw new BadRequestException("Your current password is incorrect");

    await this.adminRepository.update(
      { id },
      { password: await hashResource(changeAdminPasswordDto.new_password) },
    );

    return { message: "Password changed successfully" };
  }

  async createAdminLog(user_id, admin, entity, note, visible = false) {
    const logs = this.adminLogsRepository.create({
      user_id: user_id,
      admin: admin,
      entity: entity,
      note: note,
      visible: visible,
    });
    await this.adminLogsRepository.save(logs);
  }

  async saveExchangeRate(
    createExchangeRateDto: CreateExchangeRateDto,
    req: AdminRequest,
  ) {
    if (
      !createExchangeRateDto.rate ||
      !!isNaN(createExchangeRateDto.rate) ||
      createExchangeRateDto.rate < 1
    ) {
      throw new BadRequestException("Rate is required");
    }

    if (!createExchangeRateDto.currency) {
      throw new BadRequestException("Currency is required");
    }
    const save = await this.exchangeRateService.saveNewRate(
      req.admin.id,
      createExchangeRateDto.currency,
      createExchangeRateDto.rate,
    );

    const msg = `${req.admin.first_name} ${req.admin.last_name} changed ${createExchangeRateDto.currency} exchange rate to ${createExchangeRateDto.rate}`;
    this.createAdminLog(null, req.admin, AdminLogEntities.EXCHANGE_RATE, msg);
    return save;
  }

  async getDashboardKPI(req: AdminRequest) {
    const result = await this.userRepository
      .createQueryBuilder("users")
      .select([
        "SUM(CASE WHEN users.status = :active THEN 1 ELSE 0 END) AS activeCount",
        "SUM(CASE WHEN users.status = :pending THEN 1 ELSE 0 END) AS pendingCount",
      ])
      .setParameters({ active: Status.active, pending: Status.pending })
      .getRawOne();

    const kyc = await this.userRepository
      .createQueryBuilder("users")
      .where("users.kyc_status = :kyc_status", {
        kyc_status: KycStatus.pending,
      })
      .getCount();

    // Both transaction figures come from one pass over the table. The credit
    // volume moved into a CASE rather than a WHERE so the balance can be
    // aggregated alongside it instead of paying for a second full scan.
    //
    // `balance` is what the platform currently owes its users, summed across
    // every wallet. It deliberately mirrors the per-user formula the app
    // itself uses (TransactionService.getAccountBalance) — counting debits
    // that are still processing, since a withdrawal in flight has already
    // left the user's spendable balance — so the total reconciles with the
    // balances users see.
    const trans = await this.transactionsRepository
      .createQueryBuilder("trans")
      .select(
        "SUM(CASE WHEN trans.mode = :credit THEN trans.amount ELSE 0 END)",
        "totalAmount",
      )
      .addSelect(
        `
      SUM(
        CASE WHEN trans.mode = :credit AND trans.status = :success THEN trans.amount ELSE 0 END
      ) -
      SUM(
        CASE WHEN trans.mode = :debit AND trans.status IN (:success, :processing) THEN trans.amount ELSE 0 END
      )
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

    return {
      transactions: Number(trans.totalAmount) || 0,
      users_balance: Number(trans.balance) || 0,
      ...result,
      pending_kyc: kyc,
    };
  }

  async getUser(id: number, req: AdminRequest) {
    const user = await this.userRepository
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.wallet", "wallet")
      .where("user.id = :id", { id })
      .getOne();

    const wallet_balance = await this.getUserWalletBalance(id);

    return { user, wallet_balance };
  }

  async getUserWalletBalance(user_id) {
    const result = await this.transactionsRepository
      .createQueryBuilder("transaction")
      .select(
        `
      SUM(
        CASE WHEN transaction.mode = :credit AND transaction.status = :success THEN transaction.amount ELSE 0 END
      ) -
      SUM(
        CASE WHEN transaction.mode = :debit AND transaction.status = :success THEN transaction.amount ELSE 0 END
      )
    `,
        "balance",
      )
      .where("transaction.user_id = :user_id", { user_id: user_id })
      .setParameters({
        credit: TransactionModeType.credit,
        debit: TransactionModeType.debit,
        success: TransactionStatusType.success,
      })
      .getRawOne();

    // console.log("result", result);
    return parseFloat(result.balance) || 0;
  }

  /**
   * Users at a given KYC stage. Defaults to `none` — people who have not
   * started verification — since that is what the admin KYC page lists.
   *
   * Pass ?status=pending for the review queue (documents awaiting a decision),
   * or any other KycStatus value. `none` is stored as NULL on older rows, so
   * it is matched with IS NULL as well.
   */
  async getPendingKYC(req: AdminRequest) {
    const { limit, page, skip, status } = getRequestQuery(req);

    const kycStatus = Object.values(KycStatus).includes(status as KycStatus)
      ? (status as KycStatus)
      : KycStatus.none;

    const queryRunner = this.userRepository.createQueryBuilder("users");

    if (kycStatus === KycStatus.none) {
      queryRunner.where(
        "(users.kyc_status = :status OR users.kyc_status IS NULL)",
        { status: KycStatus.none },
      );
    } else {
      queryRunner.where("users.kyc_status = :status", { status: kycStatus });
    }

    const count = await queryRunner.getCount();
    const kyc = await queryRunner.skip(skip).take(limit).getMany();

    const metadata = paginate(count, page, limit);
    return { kyc, metadata };
  }

  async verifyKyc(user_id: number, req: AdminRequest) {
    const user = await this.userRepository
      .createQueryBuilder("user")
      .where("user.id = :id", { id: user_id })
      .getOne();
    if (!user) throw new BadRequestException("User not found");

    if (!user.kyc_image) {
      throw new BadRequestException("User has not upload kyc image");
    }
    if (user.kyc_status != KycStatus.pending) {
      throw new BadRequestException("This user does not have a pending kyc");
    }

    const update = await this.userRepository.update(
      { id: user_id },
      { kyc_status: KycStatus.success },
    );

    const msg = `${req.admin.first_name} ${req.admin.last_name} verified ${user.first_name} ${user.last_name} kyc`;
    this.createAdminLog(null, req.admin, AdminLogEntities.KYC_STATUS, msg);

    this.mixpanel.track("kyc result", user_id, { "kyc status": "verified" });
    this.mixpanel.setProfile(user_id, {
      "kyc status": "verified",
      "kyc completed date": new Date().toISOString(),
      state: user.state?.toLowerCase(),
    });

    return update;
  }

  async declineKyc(declineKycDto: DeclineKycDto, req: AdminRequest) {
    if (!declineKycDto.reason || declineKycDto.reason.length < 2) {
      throw new BadRequestException("Decline reason is required");
    }
    const user = await this.userRepository
      .createQueryBuilder("user")
      .where("user.id = :id", { id: declineKycDto.user })
      .getOne();
    if (!user) throw new BadRequestException("User not found");

    const update = await this.userRepository.update(
      { id: user.id },
      { kyc_status: KycStatus.failed, kyc_error: declineKycDto.reason },
    );

    const msg = `${req.admin.first_name} ${req.admin.last_name} declined ${user.first_name} ${user.last_name} kyc because: ${declineKycDto.reason}`;
    this.createAdminLog(null, req.admin, AdminLogEntities.KYC_STATUS, msg);

    // Fixed code only — the admin's free-text reason must not be sent.
    this.mixpanel.track("kyc result", user.id, {
      "kyc status": "rejected",
      "rejection reason code": "ADMIN_DECLINED",
    });
    this.mixpanel.setProfile(user.id, { "kyc status": "rejected" });

    return update;
  }

  async updateUserStatus(
    id: number,
    status: Status.active | Status.deactivated,
    req: AdminRequest,
  ) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new BadRequestException("User not found");

    if (user.status === status) {
      throw new BadRequestException(
        `User is already ${status === Status.active ? "active" : "deactivated"}`,
      );
    }

    await this.userRepository.update({ id: user.id }, { status });

    const activated = status === Status.active;
    const msg = `${req.admin.first_name} ${req.admin.last_name} ${activated ? "activated" : "deactivated"} ${user.first_name} ${user.last_name}'s account`;
    this.createAdminLog(null, req.admin, AdminLogEntities.USER_STATUS, msg);

    sendAccountStatusChangedEmail(user, activated);

    return {
      message: `User ${activated ? "activated" : "deactivated"} successfully`,
    };
  }

  async transaction(id: number, req: AdminRequest) {
    const transaction = this.transactionsRepository
      .createQueryBuilder("trans")
      .leftJoinAndSelect("trans.user", "user")
      .where("trans.id = :id", { id })
      .getOne();

    if (!transaction) throw new BadRequestException("Transaction not found");

    return transaction;
  }

  async getUserTransactions(id: number, req: AdminRequest) {
    const { limit, page, skip } = getRequestQuery(req);
    let queryRunner = this.transactionsRepository
      .createQueryBuilder("trans")
      .where("trans.user_id = :user_id", { user_id: id })
      .andWhere("trans.status = :status", {
        status: TransactionStatusType.success,
      });

    queryRunner = queryRunner.orderBy("trans.created_at", "DESC");

    const count = await queryRunner.getCount();
    const transactions = await queryRunner.skip(skip).take(limit).getMany();

    const metadata = paginate(count, page, limit);
    return { transactions, metadata };
  }

  async withdrawalWallets(req: AdminRequest) {
    const withdrawalWallets = await this.withdrawalWalletRepository.find();
    return { withdrawalWallets };
  }

  async transactions(req: AdminRequest) {
    const {
      limit,
      page,
      skip,
      date_from,
      date_to,
      search,
      entity_type,
      status,
    } = getRequestQuery(req);

    let queryRunner = this.transactionsRepository
      .createQueryBuilder("trans")
      .leftJoinAndSelect("trans.user", "user")
      .where("trans.status = :status", {
        status: TransactionStatusType.success,
      });

    // Search by the transacting user's email, phone or id — or the tx ref.
    if (search) {
      queryRunner = queryRunner.andWhere(
        new Brackets((qb) => {
          qb.where("user.email ILIKE :search", { search: `%${search}%` })
            .orWhere("user.phone ILIKE :search", { search: `%${search}%` })
            .orWhere("trans.masamasa_ref ILIKE :search", {
              search: `%${search}%`,
            });
          if (/^\d+$/.test(search)) {
            qb.orWhere("user.id = :searchId", {
              searchId: parseInt(search, 10),
            });
          }
        }),
      );
    }

    if (date_from) {
      queryRunner = queryRunner.andWhere(
        "trans.created_at BETWEEN :startDate AND :endDate",
        {
          startDate: new Date(date_from).toISOString(),
          endDate: new Date().toISOString(),
        },
      );
    }
    if (date_to) {
      queryRunner = queryRunner.andWhere(
        "trans.created_at BETWEEN :startDate AND :endDate",
        {
          startDate: new Date(1970).toISOString(),
          endDate: endOfDay(new Date(date_to)),
        },
      );
    }
    if (date_from && date_to) {
      queryRunner = queryRunner.andWhere(
        "trans.created_at BETWEEN :startDate AND :endDate",
        {
          startDate: new Date(date_from).toISOString(),
          endDate: endOfDay(new Date(date_to)),
        },
      );
    }
    if (
      entity_type &&
      Object.values(TransactionEntityType).includes(
        entity_type as TransactionEntityType,
      )
    ) {
      queryRunner = queryRunner.andWhere("trans.entity_type = :entity_type", {
        entity_type: entity_type,
      });
    }

    if (
      status &&
      Object.values(TransactionStatusType).includes(
        status as TransactionStatusType,
      )
    ) {
      queryRunner = queryRunner.andWhere("trans.status = :status", {
        status: status,
      });
    }

    queryRunner = queryRunner.orderBy("trans.created_at", "DESC");

    const count = await queryRunner.getCount();
    const transactions = await queryRunner.skip(skip).take(limit).getMany();

    const metadata = paginate(count, page, limit);
    return { transactions, metadata };
  }

  // Filters shared by the pending-payout list and its totals,
  private pendingWithdrawalsQuery(filters: {
    statuses: TransactionStatusType[];
    search?: string;
    date_from?: string;
    date_to?: string;
  }) {
    const { search } = filters;

    let queryRunner = this.transactionsRepository
      .createQueryBuilder("trans")
      .leftJoin("trans.user", "user")
      .where("trans.entity_type = :entity_type", {
        entity_type: TransactionEntityType.withdrawal,
      })
      .andWhere("trans.status IN (:...statuses)", {
        statuses: filters.statuses,
      });

    if (search) {
      queryRunner = queryRunner.andWhere(
        new Brackets((qb) => {
          qb.where("user.email ILIKE :search", { search: `%${search}%` })
            .orWhere("user.phone ILIKE :search", { search: `%${search}%` })
            .orWhere("trans.masamasa_ref ILIKE :search", {
              search: `%${search}%`,
            })
            .orWhere("trans.metadata->>'accountNumber' ILIKE :search", {
              search: `%${search}%`,
            })
            .orWhere("trans.metadata->>'accountName' ILIKE :search", {
              search: `%${search}%`,
            });
          if (/^\d+$/.test(search)) {
            qb.orWhere("user.id = :searchId", {
              searchId: parseInt(search, 10),
            });
          }
        }),
      );
    }

    if (filters.date_from) {
      queryRunner = queryRunner.andWhere("trans.created_at >= :startDate", {
        startDate: new Date(filters.date_from).toISOString(),
      });
    }
    if (filters.date_to) {
      queryRunner = queryRunner.andWhere("trans.created_at <= :endDate", {
        endDate: endOfDay(new Date(filters.date_to)),
      });
    }

    return queryRunner;
  }

  async pendingWithdrawals(req: AdminRequest) {
    const { limit, page, skip, search, status, date_from, date_to } =
      getRequestQuery(req);

    const pendingStatuses = [
      TransactionStatusType.processing,
      TransactionStatusType.pending,
    ];

    const filters = {
      // ?status= narrows to one leg of the queue; anything else shows both.
      statuses: pendingStatuses.includes(status as TransactionStatusType)
        ? [status as TransactionStatusType]
        : pendingStatuses,
      search,
      date_from,
      date_to,
    };

    const listQuery = this.pendingWithdrawalsQuery(filters)
      .addSelect([
        "user.id",
        "user.first_name",
        "user.last_name",
        "user.email",
        "user.phone",
      ])
      .orderBy("trans.created_at", "DESC");

    const count = await listQuery.getCount();
    const rows = await listQuery.skip(skip).take(limit).getMany();

    const totals = await this.pendingWithdrawalsQuery(filters)
      .select("COALESCE(SUM(trans.amount), 0)", "total")
      .getRawOne();

    const withdrawals = rows.map((trans) => ({
      id: trans.id,
      reference: trans.masamasa_ref,
      amount: Number(trans.amount) || 0,
      currency: trans.currency,
      status: trans.status,
      retry: trans.retry,
      session_id: trans.session_id,
      bank_name: trans.metadata?.bankName ?? null,
      account_name: trans.metadata?.accountName ?? null,
      account_number: trans.metadata?.accountNumber ?? null,
      narration: trans.metadata?.narration ?? null,
      note: trans.metadata?.note ?? null,
      created_at: trans.created_at,
      updated_at: trans.updated_at,
      user: trans.user
        ? {
            id: trans.user.id,
            first_name: trans.user.first_name,
            last_name: trans.user.last_name,
            email: trans.user.email,
            phone: trans.user.phone,
          }
        : null,
    }));

    const metadata = paginate(count, page, limit);
    return {
      withdrawals,
      totals: { count, amount: parseFloat(totals?.total) || 0 },
      metadata,
    };
  }

  async getUsers(req: AdminRequest) {
    const { limit, page, search, skip, date_from, date_to } =
      getRequestQuery(req);
    let count = await this.userRepository.count();
    let users: User[] = [];
    const queryRunner = this.userRepository.createQueryBuilder("users");

    if (search) {
      queryRunner.where(
        new Brackets((qb) => {
          qb.where("users.first_name ILIKE :search", {
            search: `%${search}%`,
          })
            .orWhere("users.last_name ILIKE :search", { search: `%${search}%` })
            .orWhere("users.email ILIKE :search", { search: `%${search}%` })
            .orWhere("users.phone ILIKE :search", { search: `%${search}%` })
            // Match the full name too, so "john doe" finds a user whose
            // first and last names are stored separately.
            .orWhere(
              "CONCAT(users.first_name, ' ', users.last_name) ILIKE :search",
              { search: `%${search}%` },
            );
          // Numeric search also matches the user id exactly
          if (/^\d+$/.test(search)) {
            qb.orWhere("users.id = :searchId", {
              searchId: parseInt(search, 10),
            });
          }
        }),
      );
    }

    // Join-date range. Each bound is optional so "from only" and "to only"
    // both work; date_to covers the whole day, not midnight.
    if (date_from) {
      queryRunner.andWhere("users.created_at >= :dateFrom", {
        dateFrom: new Date(date_from),
      });
    }
    if (date_to) {
      queryRunner.andWhere("users.created_at <= :dateTo", {
        dateTo: endOfDay(new Date(date_to)),
      });
    }

    // KYC status filter. "none" covers users who never started verification
    // (the column is null for them).
    const kycStatus = req.query.kyc_status as string;
    if (kycStatus) {
      if (kycStatus === "none") {
        queryRunner.andWhere("users.kyc_status IS NULL");
      } else {
        queryRunner.andWhere("users.kyc_status = :kycStatus", { kycStatus });
      }
    }

    queryRunner.orderBy("users.created_at", "DESC");

    count = await queryRunner.getCount();
    users = await queryRunner.skip(skip).take(limit).getMany();

    // Wallet balances for this page only — one aggregate query rather than
    // one per user. Same formula as the user detail page so they agree.
    const balances = new Map<number, number>();
    if (users.length > 0) {
      const rows = await this.transactionsRepository
        .createQueryBuilder("t")
        .select("t.user_id", "user_id")
        .addSelect(
          `SUM(CASE WHEN t.mode = :credit AND t.status = :success THEN t.amount ELSE 0 END) -
           SUM(CASE WHEN t.mode = :debit AND t.status = :success THEN t.amount ELSE 0 END)`,
          "balance",
        )
        .where("t.user_id IN (:...userIds)", {
          userIds: users.map((u) => u.id),
        })
        .setParameters({
          credit: TransactionModeType.credit,
          debit: TransactionModeType.debit,
          success: TransactionStatusType.success,
        })
        .groupBy("t.user_id")
        .getRawMany();

      for (const row of rows) {
        balances.set(Number(row.user_id), parseFloat(row.balance) || 0);
      }
    }

    const usersWithBalance = users.map((user) => ({
      ...user,
      wallet_balance: balances.get(user.id) ?? 0,
    }));

    const metadata = paginate(count, page, limit);
    return { users: usersWithBalance, metadata };
  }

  /**
   * Creates a staff account in `pending` and emails an invite link.
   *
   * The account has no password until the invite is accepted, so it cannot be
   * logged into in the meantime — both admin guards reject a non-active status.
   */
  async createStaff(createStaffDto: CreateStaffDto, req: AdminRequest) {
    const email = createStaffDto.email.trim().toLowerCase();

    // withDeleted, otherwise a soft-deleted admin collides with the unique
    // index on email and surfaces as a 500 instead of this message.
    const existing = await this.adminRepository.findOne({
      where: { email },
      withDeleted: true,
    });
    if (existing)
      throw new BadRequestException(
        "An admin with this email address already exists",
      );

    const { raw, hash } = generateInviteToken();

    const staff = await this.adminRepository.save(
      this.adminRepository.create({
        first_name: createStaffDto.first_name.trim(),
        last_name: createStaffDto.last_name.trim(),
        email,
        role: createStaffDto.role as AdministratorRoles,
        status: AdminStatus.pending,
        password: null,
        invite_token: hash,
        invite_sent_at: new Date(),
      }),
    );

    await this.sendInvite(staff, raw, false);

    this.createAdminLog(
      null,
      req.admin,
      AdminLogEntities.STAFF,
      `${capitalizeString(req.admin.first_name)} invited ${email} as ${createStaffDto.role}`,
    );

    return {
      staff: this.serializeStaff(staff),
      message: "Invite sent successfully",
    };
  }

  /** Paginated staff list. Supports ?search=, ?status= and ?role=. */
  async getStaff(req: AdminRequest) {
    const { limit, page, search, skip } = getRequestQuery(req);

    const query = this.adminRepository.createQueryBuilder("admin");

    if (search) {
      query.andWhere(
        new Brackets((qb) => {
          qb.where("admin.first_name ILIKE :search", { search: `%${search}%` })
            .orWhere("admin.last_name ILIKE :search", { search: `%${search}%` })
            .orWhere("admin.email ILIKE :search", { search: `%${search}%` })
            .orWhere(
              "CONCAT(admin.first_name, ' ', admin.last_name) ILIKE :search",
              { search: `%${search}%` },
            );
        }),
      );
    }

    const status = req.query.status as string;
    if (status) query.andWhere("admin.status = :status", { status });

    const role = req.query.role as string;
    if (role) query.andWhere("admin.role = :role", { role });

    query.orderBy("admin.created_at", "DESC");

    const count = await query.getCount();
    const staff = await query.skip(skip).take(limit).getMany();

    return {
      staff: staff.map((member) => this.serializeStaff(member)),
      metadata: paginate(count, page, limit),
    };
  }

  /** Enables or disables a staff account. */
  async updateStaffStatus(
    id: string,
    updateStaffStatusDto: UpdateStaffStatusDto,
    req: AdminRequest,
  ) {
    const staff = await this.findStaff(id);
    const status = updateStaffStatusDto.status as AdminStatus;

    if (staff.id === req.admin.id)
      throw new BadRequestException("You cannot change your own status");

    // An invited account has no password yet, so enabling it would produce an
    // account that can never be logged into. It has to accept the invite.
    if (staff.status === AdminStatus.pending)
      throw new BadRequestException(
        "This staff member has not accepted their invite yet. Resend the invite instead.",
      );

    await this.adminRepository.update({ id: staff.id }, { status });

    // AdminAuthGuard reads the admin through this cache key, so a stale entry
    // would keep a disabled account working until the TTL expired.
    this.cacheService.del(`admin:${staff.id}`);

    this.createAdminLog(
      null,
      req.admin,
      AdminLogEntities.STAFF,
      `${capitalizeString(req.admin.first_name)} set ${staff.email} to ${status}`,
    );

    return {
      staff: this.serializeStaff({ ...staff, status }),
      message:
        status === AdminStatus.active
          ? "Staff account enabled"
          : "Staff account disabled",
    };
  }

  /** Issues a fresh invite token and re-sends the link, resetting the clock. */
  async resendStaffInvite(id: string, req: AdminRequest) {
    const staff = await this.findStaff(id);

    if (staff.status !== AdminStatus.pending)
      throw new BadRequestException(
        "This staff member has already accepted their invite",
      );

    const { raw, hash } = generateInviteToken();
    await this.adminRepository.update(
      { id: staff.id },
      { invite_token: hash, invite_sent_at: new Date() },
    );

    await this.sendInvite(staff, raw, true);

    this.createAdminLog(
      null,
      req.admin,
      AdminLogEntities.STAFF,
      `${capitalizeString(req.admin.first_name)} resent the invite for ${staff.email}`,
    );

    return { message: "Invite resent successfully" };
  }

  private async findStaff(id: string) {
    const staff = await this.adminRepository.findOne({
      where: { id: parseInt(id, 10) },
    });
    if (!staff)
      throw new BadRequestException("This staff member was not found");
    return staff;
  }

  /**
   * Sends the invite link. Awaited and allowed to throw — unlike the
   * fire-and-forget alerts, a staff member who never receives the link has no
   * way to activate their account.
   */
  private async sendInvite(
    staff: Administrator,
    rawToken: string,
    isResend: boolean,
  ) {
    // Must match the admin panel's public route: /staff/invite/:token
    const link = `${appConfig.ADMIN_FRONTEND}/staff/invite/${rawToken}`;
    try {
      await sendStaffInviteEmail(staff, link, isResend);
    } catch {
      throw new BadRequestException(
        "The staff account was saved but the invite email could not be sent. Use resend invite to try again.",
      );
    }
  }

  /** Never leaks password or invite_token, whatever the caller selected. */
  private serializeStaff(staff: Administrator) {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const { password, invite_token, ...safe } = staff;
    /* eslint-enable @typescript-eslint/no-unused-vars */
    return safe;
  }
}
