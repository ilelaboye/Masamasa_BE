import { ApiProperty } from "@nestjs/swagger";

export class CreateAffiliateDto {
  @ApiProperty({
    example: [12, 47],
    description: "IDs of the users to enroll as affiliates",
  })
  user_ids: number[];
}
