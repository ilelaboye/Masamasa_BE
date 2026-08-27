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

export class ReprocessTransactionDto {
  @ApiProperty({ example: [2, 3, 4] })
  transaction_ids: number[];
}

export class BroadcastNotificationDto {
  @ApiProperty({ example: "We have a new feature!" })
  message: string;

  @ApiProperty({
    example: "announcement",
    required: false,
    description:
      "Category the app uses to pick an icon. Defaults to 'announcement'.",
  })
  tag?: string;

  @ApiProperty({
    example: "all",
    required: false,
    enum: ["all", "verified", "unverified"],
    description: "Who receives it. 'verified' means KYC verified.",
  })
  audience?: "all" | "verified" | "unverified";

  @ApiProperty({
    example: "2026-09-01T14:00:00+01:00",
    required: false,
    description:
      "Leave empty to send now. Pick a future time on the hour and it goes out during that hour.",
  })
  scheduled_for?: string;
}

export class UpdateScheduledBroadcastDto {
  @ApiProperty({ example: "Updated announcement text", required: false })
  message?: string;

  @ApiProperty({ example: "announcement", required: false })
  tag?: string;

  @ApiProperty({
    example: "2026-09-01T15:00:00+01:00",
    required: false,
    description: "Reschedule to a different hour. Must be on the hour.",
  })
  scheduled_for?: string;
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

export class CreateStaffDto {
  @ApiProperty({ example: "alice" })
  first_name: string;

  @ApiProperty({ example: "joe" })
  last_name: string;

  @ApiProperty({ example: "alice@masamasa.ng" })
  email: string;

  @ApiProperty({ example: "marketer", enum: ["marketer"] })
  role: string;
}

export class UpdateStaffStatusDto {
  @ApiProperty({ example: "suspend", enum: ["active", "suspend"] })
  status: string;
}

export class AcceptStaffInviteDto {
  @ApiProperty({ example: "a3f1...9c2e" })
  token: string;

  @ApiProperty({ example: "Password@123" })
  password: string;

  @ApiProperty({ example: "08012345678" })
  phone: string;
}
