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

export class UploadImageDto {
  @ApiProperty({ example: "kyc or profile_image" })
  type: string;

  @ApiProperty({ example: "cloudinary image link" })
  image: string;
}

export class TransferDto {
  @ApiProperty({ example: "1234" })
  pin: string;

  @ApiProperty({ example: "lekan@gmail.com" })
  email: string;

  @ApiProperty({ example: 4500 })
  amount: number;
}

export class WithdrawalDto {
  @ApiProperty({ example: "1234" })
  pin: string;

  @ApiProperty({ example: "8102222333" })
  accountNumber: string;

  @ApiProperty({ example: "lekan@gmail.com" })
  accountName: string;

  @ApiProperty({ example: "Access Bank" })
  bankName: string;

  @ApiProperty({ example: 4500 })
  amount: number;

  @ApiProperty({ example: "0001" })
  bankCode: string;
}
