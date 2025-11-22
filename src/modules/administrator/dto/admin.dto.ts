// import { PreferenceValueType } from '@/modules/preferences/entities/preference.entity';
import { CurrencyCoin } from "@/modules/exchange-rates/exchange-rates.entity";
import { ApiProperty } from "@nestjs/swagger";

export class CreateExchangeRateDto {
  @ApiProperty({ example: 1400 })
  rate: number;

  @ApiProperty({ example: 1400 })
  currency: CurrencyCoin;
}

export class DeclineKycDto {
  @ApiProperty({ example: 2 })
  user: number;

  @ApiProperty({ example: "Image not clear" })
  reason: string;
}
