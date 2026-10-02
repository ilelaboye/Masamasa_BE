import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../users/entities/user.entity";
import { Administrator } from "../administrator/entities/administrator.entity";
import { AdminLogs } from "../administrator/entities/admin-logs.entity";
import { AdministratorService } from "../administrator/services/administrator.service";
import { ReferralEarning } from "../referrals/entities/referral-earning.entity";
import { Transactions } from "../transactions/transactions.entity";
import { AffiliatesController } from "./affiliates.controller";
import { AffiliatesService } from "./affiliates.service";
import { Affiliate } from "./entities/affiliate.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Affiliate,
      User,
      ReferralEarning,
      Administrator,
      AdminLogs,
      Transactions,
    ]),
  ],
  controllers: [AffiliatesController],
  providers: [AffiliatesService, AdministratorService],
  exports: [AffiliatesService],
})
export class AffiliatesModule {}
