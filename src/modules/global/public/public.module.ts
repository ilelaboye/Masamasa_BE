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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Webhook,
      Wallet,
      Transactions,
      Notification,
    ]),
  ],
  controllers: [PublicController],
  providers: [PublicService, NotificationsService],
})
export class PublicModule {}
