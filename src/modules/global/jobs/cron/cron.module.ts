import { Notification } from "@/modules/notifications/entities/notification.entity";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CronJob } from "./cron.job";
import { CronService } from "./cron.service";
import { Transactions } from "@/modules/transactions/transactions.entity";
import { AdministratorService } from "@/modules/administrator/services/administrator.service";
import { Administrator } from "@/modules/administrator/entities/administrator.entity";
import { User } from "@/modules/users/entities/user.entity";
import { AdminLogs } from "@/modules/administrator/entities/admin-logs.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      Transactions,
      Administrator,
      User,
      AdminLogs,
    ]),
  ],
  providers: [CronService, CronJob, AdministratorService],
})
export class CronModule {}
