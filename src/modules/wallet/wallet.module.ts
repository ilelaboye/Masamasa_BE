import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WalletService } from "./wallet.service";
import { Wallet } from "./wallet.entity";

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Wallet])],
  controllers: [],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
