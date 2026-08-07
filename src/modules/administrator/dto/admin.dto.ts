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

export class BroadcastNotificationDto {
  @ApiProperty({ example: "We have a new feature!" })
  message: string;
}

export class UpdateAdminProfileDto {
  @ApiProperty({ example: "alice" })
  first_name: string;

  @ApiProperty({ example: "joe" })
  last_name: string;

  @ApiProperty({ example: "08012345678" })
  phone: string;

  @ApiProperty({ example: "12 Marina Road, Lagos", required: false })
  address?: string;
}

export class ChangeAdminPasswordDto {
  @ApiProperty({ example: "Password@123" })
  old_password: string;

  @ApiProperty({ example: "NewPassword@456" })
  new_password: string;
}
