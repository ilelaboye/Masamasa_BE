import { ApiProperty } from "@nestjs/swagger";

export class ActionOnStaffInviteDto {
  @ApiProperty({ examples: ["accept", "reject"] })
  action: string;

  @ApiProperty({ example: "asdf:ldd" })
  token: string;

  @ApiProperty({ example: "9c30d5c4-0905-4a03-bfc0-789595bd4cd0" })
  companyId: string;

  @ApiProperty({
    example: "_Pa$w0rd!XYZ@09845",
    description: "Provide this if it is a new user",
  })
  password?: string;

  @ApiProperty({ example: "_Pa$w0rd!XYZ@09845" })
  password_confirmation?: string;
}

export class BankAccountVerificationDto {
  @ApiProperty({ example: "0738256104" })
  accountNumber: string;

  @ApiProperty({ example: "044" })
  bankCode: string;

  @ApiProperty({ example: "Access Bank" })
  bankName: string;
}
