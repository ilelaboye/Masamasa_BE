import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class KycDto {
  @ApiProperty({
    example: "nin",
    description: "bvn | nin | passport | drivers_license | voters_card | other",
  })
  type!: string;

  @ApiPropertyOptional({
    example: "12345678901",
    description: "The ID number. Send this or front_image, not neither.",
  })
  number?: string;

  @ApiPropertyOptional({ example: "1994-08-21" })
  dob?: string;

  @ApiPropertyOptional({
    example: "12345678901",
    description: "The holder's NIN. Required when type is passport.",
  })
  nin?: string;

  @ApiPropertyOptional({ description: "Base64 of the front of the document" })
  front_image?: string;

  @ApiPropertyOptional({ description: "Base64 of the back of the document" })
  back_image?: string;

  @ApiPropertyOptional({ description: "Base64 of the selfie" })
  selfie?: string;
}
