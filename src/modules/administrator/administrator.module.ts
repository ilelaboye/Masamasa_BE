import { Module } from "@nestjs/common";
import { AdministratorController } from "./controllers/administrator.controller";
import { AdminAuthController } from "./controllers/admin-auth.controller";
import { StaffInviteController } from "./controllers/staff-invite.controller";
import { AdministratorService } from "./services/administrator.service";
import { Administrator } from "./entities/administrator.entity";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminAuthService } from "./services/admin-auth.service";
import { AnalyticsService } from "./services/analytics.service";
import { AdminLogs } from "./entities/admin-logs.entity";
import { User } from "../users/entities/user.entity";
import { Transactions } from "../transactions/transactions.entity";
import { PurchaseRequest } from "../purchases/entities/purchases.entity";
import { AffiliatesModule } from "../affiliates/affiliates.module";

@Module({
  imports: [
    AffiliatesModule,
    TypeOrmModule.forFeature([
      Administrator,
      AdminLogs,
      User,
      Transactions,
      PurchaseRequest,
    ]),
  ],
  controllers: [
    AdministratorController,
    AdminAuthController,
    StaffInviteController,
  ],
  providers: [AdministratorService, AdminAuthService, AnalyticsService],
})
export class AdministratorModule {}
