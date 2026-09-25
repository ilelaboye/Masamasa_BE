import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class KycDto {
  @ApiProperty({
    example: "nin",
    description: "bvn | nin | passport | drivers_license | voters_card | other",
  })
  type!: string;

  @ApiPropertyOptional({
    example: "12345678901",
    description:
      "The ID number, with dob. Looked-up types only (bvn, nin) — rejected for passport, drivers_license and voters_card, which an admin reviews.",
  })
  number?: string;

  @ApiPropertyOptional({ example: "1994-08-21" })
  dob?: string;

  @ApiPropertyOptional({
    description:
      "Base64 of the front of the document. Required for passport, drivers_license and voters_card.",
  })
  front_image?: string;

  @ApiPropertyOptional({ description: "Base64 of the back of the document" })
  back_image?: string;

  @ApiPropertyOptional({ description: "Base64 of the selfie" })
  selfie?: string;
}

export class AddressKycDto {
  @ApiProperty({ example: "12 Allen Avenue, Ikeja" })
  address!: string;

  @ApiProperty({ example: "Lagos" })
  city!: string;

  @ApiProperty({ example: "Lagos State" })
  state!: string;

  @ApiProperty({ example: "Nigeria" })
  country!: string;

  @ApiPropertyOptional({ example: "100001" })
  postal_code?: string;

  @ApiProperty({
    example: "electricity_bill",
    description:
      "electricity_bill | water_bill | government_correspondence | other",
  })
  document_type!: string;

  @ApiProperty({ description: "Base64 of the proof of address" })
  document_image!: string;
}
