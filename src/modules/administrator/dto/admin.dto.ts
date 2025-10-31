// import { PreferenceValueType } from '@/modules/preferences/entities/preference.entity';
import { ApiProperty } from "@nestjs/swagger";

export class CreateExchangeRateDto {
  @ApiProperty({ example: 1400 })
  rate: number;
}
