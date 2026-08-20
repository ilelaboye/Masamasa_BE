import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Notification } from "../notifications/entities/notification.entity";
import { Transactions } from "../transactions/transactions.entity";
import { User } from "../users/entities/user.entity";
import { ReferralEarning } from "./entities/referral-earning.entity";
import { ReferralsController } from "./referrals.controller";
import { ReferralsService } from "./referrals.service";

/**
 * Global because two modules outside this one depend on the service: the auth
 * flow resolves a referral code at signup, and the deposit webhooks re-check
 * qualification after every confirmed deposit.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReferralEarning,
      User,
      Transactions,
      Notification,
    ]),
  ],
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
