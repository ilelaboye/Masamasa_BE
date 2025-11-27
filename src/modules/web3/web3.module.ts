import { Module } from "@nestjs/common";
import { Web3Controller } from "./web3.controller";
import { Web3Service } from "./web3.service";
import { WalletService } from "../wallet/wallet.service";
import { Wallet } from '../wallet/wallet.entity';
import { TypeOrmModule } from "@nestjs/typeorm";
@Module({
  imports: [TypeOrmModule.forFeature([Wallet])],
  controllers: [Web3Controller],
  providers: [Web3Service, WalletService],
  exports: [WalletService],
})
export class Web3Module { }
