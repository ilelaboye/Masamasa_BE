import { Global, Module } from "@nestjs/common";
import { BeneficiariesController } from "./beneficiaries.controller";
import { BeneficiariesService } from "./beneficiaries.service";

@Global()
@Module({
  controllers: [BeneficiariesController],
  providers: [BeneficiariesService],
  exports: [BeneficiariesService],
})
export class BeneficiariesModule {}
