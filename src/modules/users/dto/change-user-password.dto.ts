import { ApiProperty } from "@nestjs/swagger";

export class ChangeUserPasswordDto {
  @ApiProperty({ example: "_Pa$$w0rd!XYZ" })
  old_password: string;

  @ApiProperty({ example: "_Pa$$w0rd!XYZ01" })
  new_password: string;

  @ApiProperty({ example: "_Pa$$w0rd!XYZ01" })
  new_password_confirmation?: string;
}

export class CreatePinDto {
  @ApiProperty({ example: "1234" })
  pin: string;
}

export class ChangePinDto {
  @ApiProperty({ example: "1234" })
  pin: string;

  @ApiProperty({ example: "1234" })
  old_pin: string;
}

export class TransferDto {
  @ApiProperty({ example: "1234" })
  pin: string;

  @ApiProperty({ example: "lekan@gmail.com" })
  email: string;

  @ApiProperty({ example: 4500 })
  amount: number;
}
