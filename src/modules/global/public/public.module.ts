import { User } from "@/modules/users/entities/user.entity";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PublicController } from "./public.controller";
import { PublicService } from "./public.service";
import { Webhook } from "./entities/webhook.entity";
import { Wallet } from "@/modules/wallet/wallet.entity";
import { Transactions } from "@/modules/transactions/transactions.entity";

@Module({
  imports: [TypeOrmModule.forFeature([User, Webhook, Wallet, Transactions])],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
