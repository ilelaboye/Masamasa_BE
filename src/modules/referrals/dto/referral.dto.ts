import { ApiProperty } from "@nestjs/swagger";

export class ReferralEarningsQueryDto {
  @ApiProperty({ example: 1, required: false })
  page?: number;

  @ApiProperty({ example: 20, required: false })
  limit?: number;
}
