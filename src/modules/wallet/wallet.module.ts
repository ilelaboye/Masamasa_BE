import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WalletService } from "./wallet.service";
import { Wallet } from "./wallet.entity";
import { WalletController } from "./wallet.controller";

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Wallet])],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
