import { Module } from "@nestjs/common";
import { Web3Controller } from "./web3.controller";
import { Web3Service } from "./web3.service";
import { WalletService } from "../wallet/wallet.service";
import { Wallet } from "../wallet/wallet.entity";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PublicModule } from "../global";
import { TransactionService } from "../transactions/transactions.service";
import { Transactions } from "../transactions/transactions.entity";
@Module({
  imports: [TypeOrmModule.forFeature([Wallet, Transactions]), PublicModule],
  controllers: [Web3Controller],
  providers: [Web3Service, WalletService, TransactionService],
  exports: [WalletService, TransactionService, Web3Service],
})
export class Web3Module {}
