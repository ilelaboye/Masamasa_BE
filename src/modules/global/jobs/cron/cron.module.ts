import { Notification } from "@/modules/notifications/entities/notification.entity";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CronJob } from "./cron.job";
import { CronService } from "./cron.service";
// import { Transactions } from "@/modules/transactions/transactions.entity";
// import { AdministratorService } from "@/modules/administrator/services/administrator.service";
// import { Administrator } from "@/modules/administrator/entities/administrator.entity";
import { User } from "@/modules/users/entities/user.entity";
import { AdminLogs } from "@/modules/administrator/entities/admin-logs.entity";
import { PurchaseRequest } from "@/modules/purchases/entities/purchases.entity";
import { ProviderService } from "@/modules/purchases/services/providers.service";
import { AccessToken } from "../../bank-verification/entities/access-token.entity";
// import { UsersService } from "@/modules/users/services/users.service";
import { Transfer } from "@/modules/transfers/transfers.entity";
import { BankVerificationService } from "../../bank-verification/bank-verification.service";
import { BankVerification } from "../../bank-verification/entities/bank-verification.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      // Transactions,
      // Administrator,
      User,
      AdminLogs,
      PurchaseRequest,
      AccessToken,
      Transfer,
      BankVerification,
    ]),
  ],
  providers: [
    CronService,
    CronJob,
    // AdministratorService,
    ProviderService,
    // UsersService,
    BankVerificationService,
  ],
})
export class CronModule {}
