import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthController, UsersController } from "./controllers";
import { User } from "./entities/user.entity";
import { AuthService } from "./services/auth.service";
import { UsersService } from "./services/users.service";
import { Transfer } from "../transfers/transfers.entity";
import { BankVerificationService } from "../global/bank-verification/bank-verification.service";
import { BankVerification } from "../global/bank-verification/entities/bank-verification.entity";
import { Notification } from "../notifications/entities/notification.entity";
import { AccessToken } from "../global/bank-verification/entities/access-token.entity";
import { CronJob } from "../global/jobs/cron/cron.job";
import { Transactions } from "../transactions/transactions.entity";
import { PurchaseRequest } from "../purchases/entities/purchases.entity";
import { AdministratorService } from "../administrator/services/administrator.service";
import { ProviderService } from "../purchases/services/providers.service";
import { Administrator } from "../administrator/entities/administrator.entity";
import { AdminLogs } from "../administrator/entities/admin-logs.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Transfer,
      BankVerification,
      Notification,
      AccessToken,
      Transactions,
      PurchaseRequest,
      Administrator,
      AdminLogs,
    ]),
    EventEmitterModule.forRoot(),
  ],
  controllers: [AuthController, UsersController],
  providers: [
    UsersService,
    AuthService,
    BankVerificationService,
    CronJob,
    AdministratorService,
    ProviderService,
  ],
})
export class UsersModule {}
