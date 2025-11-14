import { CacheService } from "@/modules/global/cache-container/cache-container.service";
import { BadRequestException, Injectable } from "@nestjs/common";
import { Administrator, AdminStatus } from "../entities/administrator.entity";
import { Brackets, Repository, SelectQueryBuilder } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { AdminLogEntities, AdminLogs } from "../entities/admin-logs.entity";
import { AdminRequest } from "@/definitions";
import { CreateExchangeRateDto } from "../dto/admin.dto";
import { ExchangeRateService } from "@/modules/exchange-rates/exchange-rates.service";
import { Status, User } from "@/modules/users/entities/user.entity";
import { endOfDay, getRequestQuery } from "@/core/utils";
import { paginate } from "@/core/helpers";
import {
  TransactionModeType,
  Transactions,
} from "@/modules/transactions/transactions.entity";

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
    private readonly cacheService: CacheService,
    private readonly exchangeRateService: ExchangeRateService
  ) {}

  async getWithId(id: string) {
    const cachedData = await this.cacheService.get<Administrator | undefined>(
      `admin:${id}`
    );
    // console.log('fetched from cache', cachedData);
    if (cachedData) return cachedData;

    const admin = await this.adminRepository.findOne({
      where: { id: parseInt(id) },
    });
    if (admin) await this.cacheService.set(`admin:${id}`, admin);

    return admin;
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
    req: AdminRequest
  ) {
    if (
      !createExchangeRateDto.rate ||
      !!isNaN(createExchangeRateDto.rate) ||
      createExchangeRateDto.rate < 1
    ) {
      throw new BadRequestException("Rate is required");
    }
    const save = await this.exchangeRateService.saveNewRate(
      req.admin.id,
      createExchangeRateDto.rate
    );

    var msg = `${req.admin.first_name} ${req.admin.last_name} changed exchange rate to ${createExchangeRateDto.rate}`;
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

    const trans = await this.transactionsRepository
      .createQueryBuilder("trans")
      .select("SUM(trans.amount)", "totalAmount")
      .where("trans.mode = :mode", { mode: TransactionModeType.credit })
      .getRawOne();

    const totalAmount = Number(trans.totalAmount) || 0;

    return {
      transactions: totalAmount,
      ...result,
    };
  }

  async getUser(id: number, req: AdminRequest) {
    let user = await this.userRepository
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.wallet", "wallet")
      .where("user.id = :id", { id })
      .getOne();

    let wallet_balance = await this.getUserWalletBalance(id);

    return { user, wallet_balance };
  }

  async getUserWalletBalance(user_id) {
    const result = await this.transactionsRepository
      .createQueryBuilder("transaction")
      .select(
        `
      SUM(
        CASE WHEN transaction.mode = :credit THEN transaction.amount ELSE 0 END
      ) -
      SUM(
        CASE WHEN transaction.mode = :debit THEN transaction.amount ELSE 0 END
      )
    `,
        "balance"
      )
      .where("transaction.user_id = :user_id", { user_id: user_id })
      .setParameters({
        credit: TransactionModeType.credit,
        debit: TransactionModeType.debit,
      })
      .getRawOne();

    // console.log("result", result);
    return parseFloat(result.balance) || 0;
  }

  async transaction(id: number, req: AdminRequest) {
    let transaction = this.transactionsRepository
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
      .where("trans.user_id = :user_id", { user_id: id });

    queryRunner = queryRunner.orderBy("trans.created_at", "DESC");

    var count = await queryRunner.getCount();
    var transactions = await queryRunner.skip(skip).take(limit).getMany();

    const metadata = paginate(count, page, limit);
    return { transactions, metadata };
  }

  async transactions(req: AdminRequest) {
    const { limit, page, skip, date_from, date_to } = getRequestQuery(req);

    let queryRunner = this.transactionsRepository
      .createQueryBuilder("trans")
      .leftJoinAndSelect("trans.user", "user");

    if (date_from) {
      queryRunner = queryRunner.andWhere(
        "trans.created_at BETWEEN :startDate AND :endDate",
        {
          startDate: new Date(date_from).toISOString(),
          endDate: new Date().toISOString(),
        }
      );
    }
    if (date_to) {
      queryRunner = queryRunner.andWhere(
        "trans.created_at BETWEEN :startDate AND :endDate",
        {
          startDate: new Date(1970).toISOString(),
          endDate: endOfDay(new Date(date_to)),
        }
      );
    }
    if (date_from && date_to) {
      queryRunner = queryRunner.andWhere(
        "trans.created_at BETWEEN :startDate AND :endDate",
        {
          startDate: new Date(date_from).toISOString(),
          endDate: endOfDay(new Date(date_to)),
        }
      );
    }

    queryRunner = queryRunner.orderBy("trans.created_at", "DESC");

    var count = await queryRunner.getCount();
    var transactions = await queryRunner.skip(skip).take(limit).getMany();

    const metadata = paginate(count, page, limit);
    return { transactions, metadata };
  }

  async getUsers(req: AdminRequest) {
    const { limit, page, search, skip } = getRequestQuery(req);
    let count = await this.userRepository.count();
    var users: User[] = [];
    const queryRunner = this.userRepository.createQueryBuilder("users");

    if (search) {
      queryRunner.where(
        new Brackets((qb) => {
          qb.where("users.first_name LIKE :first_name", {
            first_name: `%${search}%`,
          })
            .orWhere("users.last_name LIKE :last_name", {
              last_name: `%${search}%`,
            })
            .orWhere("users.email LIKE :email", { email: `%${search}%` });
        })
      );
    }
    count = await queryRunner.getCount();
    users = await queryRunner.skip(skip).take(limit).getMany();

    const metadata = paginate(count, page, limit);
    return { users, metadata };
  }
}
