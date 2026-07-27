import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { QuidaxService } from "./quidax.service";
import { QuidaxWalletCron } from "./quidax-wallet.cron";
import { User } from "../users/entities/user.entity";
import { Wallet } from "../wallet/wallet.entity";

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([User, Wallet])],
  providers: [QuidaxService, QuidaxWalletCron],
  exports: [QuidaxService],
})
export class QuidaxModule {}
