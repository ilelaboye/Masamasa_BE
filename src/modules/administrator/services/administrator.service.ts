import { CacheService } from "@/modules/global/cache-container/cache-container.service";
import { BadRequestException, Injectable } from "@nestjs/common";
import { Administrator, AdminStatus } from "../entities/administrator.entity";
import { Repository, SelectQueryBuilder } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { AdminLogs } from "../entities/admin-logs.entity";
import { AdminRequest } from "@/definitions";

@Injectable()
export class AdministratorService {
  constructor(
    @InjectRepository(Administrator)
    private readonly adminRepository: Repository<Administrator>,
    @InjectRepository(AdminLogs)
    private readonly adminLogsRepository: Repository<AdminLogs>,
    private readonly cacheService: CacheService
  ) {}

  async getWithId(id: string) {
    const cachedData = await this.cacheService.get<Administrator | undefined>(
      `admin:${id}`
    );
    // console.log('fetched from cache', cachedData);
    if (cachedData) return cachedData;

    const admin = await this.adminRepository.findOne({
      where: { id: parseInt(id) },
      relations: ["permissions"],
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
}
