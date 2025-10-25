import { Notification } from "@/modules/notifications/entities/notification.entity";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CronJob } from "./cron.job";
import { CronService } from "./cron.service";

@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  providers: [CronService, CronJob],
})
export class CronModule {}
