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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PurchaseRequest,
      User,
      Transfer,
      BankVerification,
    ]),
  ],
  controllers: [PurchaseController],
  providers: [
    PurchaseService,
    ProviderService,
    UsersService,
    BankVerificationService,
  ],
})
export class PurchasesModule {}
