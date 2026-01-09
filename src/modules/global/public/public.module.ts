import { User } from "@/modules/users/entities/user.entity";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PublicController } from "./public.controller";
import { PublicService } from "./public.service";
import { Webhook } from "./entities/webhook.entity";
import { Wallet } from "@/modules/wallet/wallet.entity";
import { Transactions } from "@/modules/transactions/transactions.entity";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import { Notification } from "@/modules/notifications/entities/notification.entity";
import { AccessToken } from "../bank-verification/entities/access-token.entity";
import { CronJob } from "../jobs/cron/cron.job";
import { PurchaseRequest } from "@/modules/purchases/entities/purchases.entity";
import { AdministratorService } from "@/modules/administrator/services/administrator.service";
import { ProviderService } from "@/modules/purchases/services/providers.service";
import { Administrator } from "@/modules/administrator/entities/administrator.entity";
import { AdminLogs } from "@/modules/administrator/entities/admin-logs.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Webhook,
      Wallet,
      Transactions,
      Notification,
      AccessToken,
      PurchaseRequest,
      Administrator,
      AdminLogs,
    ]),
  ],
  controllers: [PublicController],
  exports: [PublicService],
  providers: [
    PublicService,
    NotificationsService,
    CronJob,
    AdministratorService,
    ProviderService,
  ],
})
export class PublicModule {}
