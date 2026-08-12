import { CacheService } from "@/modules/global/cache-container/cache-container.service";
import { MixpanelService } from "@/modules/global/mixpanel/mixpanel.service";
import { BadRequestException, Injectable } from "@nestjs/common";
import { Administrator, AdminStatus } from "../entities/administrator.entity";
import { Brackets, Repository, SelectQueryBuilder } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { AdminLogEntities, AdminLogs } from "../entities/admin-logs.entity";
import { AdminRequest } from "@/definitions";
import {
  ChangeAdminPasswordDto,
  CreateExchangeRateDto,
  DeclineKycDto,
  UpdateAdminProfileDto,
} from "../dto/admin.dto";
import { ExchangeRateService } from "@/modules/exchange-rates/exchange-rates.service";
import { KycStatus, Status, User } from "@/modules/users/entities/user.entity";
import {
  endOfDay,
  getRequestQuery,
  hashResource,
  sendZohoMail,
  verifyHash,
} from "@/core/utils";
import { capitalizeString, paginate } from "@/core/helpers";
import {
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

    const trans = await this.transactionsRepository
      .createQueryBuilder("trans")
      .select("SUM(trans.amount)", "totalAmount")
      .where("trans.mode = :mode", { mode: TransactionModeType.credit })
      .getRawOne();

    const totalAmount = Number(trans.totalAmount) || 0;

    return {
      transactions: totalAmount,
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

  async getPendingKYC(req: AdminRequest) {
    const { limit, page, skip } = getRequestQuery(req);
    const queryRunner = this.userRepository
      .createQueryBuilder("users")
      .where("users.kyc_status = :status", { status: KycStatus.pending });

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

    sendZohoMail(
      {
        to: {
          name: `${capitalizeString(user.first_name)} ${capitalizeString(user.last_name)}`,
          email: user.email,
        },
      },
      {
        subject: activated
          ? "Your MasaMasa account has been activated"
          : "Your MasaMasa account has been deactivated",
        html: activated
          ? `<p>Hello ${capitalizeString(user.first_name)},</p>
             <p>Good news — your MasaMasa account has been activated. You can now log in and use all features of the app.</p>
             <p>If you have any questions, please contact our support team.</p>`
          : `<p>Hello ${capitalizeString(user.first_name)},</p>
             <p>Your MasaMasa account has been deactivated. You will not be able to log in or perform any transactions.</p>
             <p>If you believe this is a mistake, please reach out to our support team to have your account reactivated.</p>`,
      },
    );

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
    const { limit, page, skip, date_from, date_to, search } =
      getRequestQuery(req);

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

    queryRunner = queryRunner.orderBy("trans.created_at", "DESC");

    const count = await queryRunner.getCount();
    const transactions = await queryRunner.skip(skip).take(limit).getMany();

    const metadata = paginate(count, page, limit);
    return { transactions, metadata };
  }

  async getUsers(req: AdminRequest) {
    const { limit, page, search, skip } = getRequestQuery(req);
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
            .orWhere("users.phone ILIKE :search", { search: `%${search}%` });
          // Numeric search also matches the user id exactly
          if (/^\d+$/.test(search)) {
            qb.orWhere("users.id = :searchId", {
              searchId: parseInt(search, 10),
            });
          }
        }),
      );
    }
    count = await queryRunner.getCount();
    users = await queryRunner.skip(skip).take(limit).getMany();

    const metadata = paginate(count, page, limit);
    return { users, metadata };
  }
}
