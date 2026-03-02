import { Module } from "@nestjs/common";
import { Web3Controller } from "./web3.controller";
import { Web3Service } from "./web3.service";
import { WalletService } from "../wallet/wallet.service";
import { Wallet } from "../wallet/wallet.entity";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PublicModule } from "../global";
import { TransactionService } from "../transactions/transactions.service";
import { Transactions } from "../transactions/transactions.entity";
import { User } from "../users/entities/user.entity";
import { WalletTrackingCron } from "./wallet-tracking.cron";
@Module({
  imports: [TypeOrmModule.forFeature([Wallet, Transactions, User]), PublicModule],
  controllers: [Web3Controller],
  providers: [Web3Service, WalletService, TransactionService, WalletTrackingCron],
  exports: [WalletService, TransactionService, Web3Service],
})
export class Web3Module { }
