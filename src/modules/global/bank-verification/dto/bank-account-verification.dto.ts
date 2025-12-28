import { ApiProperty } from "@nestjs/swagger";

export class BankAccountVerificationDto {
  @ApiProperty({ example: "0738256104" })
  accountNumber: string;

  @ApiProperty({ example: "044" })
  bankCode: string;

  @ApiProperty({ example: "Access Bank" })
  bankName: string;
}
