import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PurchaseRequest } from "./entities/purchases.entity";
import { PurchaseController } from "./purchases.controller";
import { PurchaseService } from "./services/purchases.service";
import { ProviderService } from "./services/providers.service";
import { UsersService } from "../users/services/users.service";
import { User } from "../users/entities/user.entity";
import { Transfer } from "../transfers/transfers.entity";
import { BankVerificationService } from "../global/bank-verification/bank-verification.service";
import { BankVerification } from "../global/bank-verification/entities/bank-verification.entity";
import { Notification } from "../notifications/entities/notification.entity";
import { AccessToken } from "../global/bank-verification/entities/access-token.entity";
import { CronJob } from "../global/jobs/cron/cron.job";
import { Transactions } from "../transactions/transactions.entity";
import { AdministratorService } from "../administrator/services/administrator.service";
import { AdminLogs } from "../administrator/entities/admin-logs.entity";
import { Administrator } from "../administrator/entities/administrator.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PurchaseRequest,
      User,
      Transfer,
      BankVerification,
      Notification,
      AccessToken,
      Transactions,
      AdminLogs,
      Administrator,
    ]),
  ],
  controllers: [PurchaseController],
  providers: [
    PurchaseService,
    ProviderService,
    UsersService,
    BankVerificationService,
    CronJob,
    AdministratorService,
  ],
})
export class PurchasesModule {}
