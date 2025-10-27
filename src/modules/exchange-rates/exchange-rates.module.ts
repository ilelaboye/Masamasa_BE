import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ExchangeRate } from "./exchange-rates.entity";
import { ExchangeRateService } from "./exchange-rates.service";

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ExchangeRate])],
  controllers: [],
  providers: [ExchangeRateService],
  exports: [ExchangeRateService],
})
export class ExchangeRateModule {}
