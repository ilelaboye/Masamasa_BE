import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BankVerificationService } from "./bank-verification.service";
import { BankVerification } from "./entities/bank-verification.entity";
import { AccessToken } from "./entities/access-token.entity";

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([BankVerification, AccessToken])],
  providers: [BankVerificationService],
  exports: [BankVerificationService],
})
export class BankVerificationModule {}
