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
import { WithdrawalWallet } from "./entity/withdrawal-wallet.entity";
import { Withdrawal } from "./entity/withdrawal.entity";
import { DisposableWallet } from "./entity/disposable-wallet.entity";
import { DisposableWalletService } from "./services/disposable-wallet.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Wallet,
      Transactions,
      User,
      WithdrawalWallet,
      Withdrawal,
      DisposableWallet,
    ]),
    PublicModule,
  ],
  controllers: [Web3Controller],
  providers: [
    Web3Service,
    WalletService,
    TransactionService,
    WalletTrackingCron,
    DisposableWalletService,
  ],
  exports: [WalletService, TransactionService, Web3Service, DisposableWalletService],
})
export class Web3Module {}
