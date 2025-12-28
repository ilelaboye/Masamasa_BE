import { Module } from "@nestjs/common";
import { AdministratorController } from "./controllers/administrator.controller";
import { AdminAuthController } from "./controllers/admin-auth.controller";
import { AdministratorService } from "./services/administrator.service";
import { Administrator } from "./entities/administrator.entity";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminAuthService } from "./services/admin-auth.service";
import { AdminLogs } from "./entities/admin-logs.entity";
import { User } from "../users/entities/user.entity";
import { Transactions } from "../transactions/transactions.entity";
import { Web3Module } from "../web3/web3.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Administrator, AdminLogs, User, Transactions]),
    Web3Module,
  ],
  controllers: [AdministratorController, AdminAuthController],
  providers: [AdministratorService, AdminAuthService],
})
export class AdministratorModule {}
