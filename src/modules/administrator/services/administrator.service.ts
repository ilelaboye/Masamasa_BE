import { CacheService } from "@/modules/global/cache-container/cache-container.service";
import { BadRequestException, Injectable } from "@nestjs/common";
import { Administrator, AdminStatus } from "../entities/administrator.entity";
import { Brackets, Repository, SelectQueryBuilder } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { AdminLogEntities, AdminLogs } from "../entities/admin-logs.entity";
import { AdminRequest } from "@/definitions";
import { CreateExchangeRateDto } from "../dto/admin.dto";
import { ExchangeRateService } from "@/modules/exchange-rates/exchange-rates.service";
import { User } from "@/modules/users/entities/user.entity";
import { getRequestQuery } from "@/core/utils";
import { paginate } from "@/core/helpers";

@Injectable()
export class AdministratorService {
  constructor(
    @InjectRepository(Administrator)
    private readonly adminRepository: Repository<Administrator>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AdminLogs)
    private readonly adminLogsRepository: Repository<AdminLogs>,
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
