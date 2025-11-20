import { ApiProperty } from "@nestjs/swagger";

export class PurchaseRequestItemDto {
  @ApiProperty({ example: 1, description: "Network" })
  network: string;

  @ApiProperty({ example: "Alice Ubuntu", description: "Recipient name" })
  recipient_name?: string;

  @ApiProperty({
    example: "MTN N800 3GB - 2 days",
    description: "Product name",
  })
  product_name?: string;

  @ApiProperty({ example: "mtn-100mb-1000", description: "Product name" })
  variation_code?: string;

  @ApiProperty({
    example: "081022333455",
    description: "Phone number of the recipient",
  })
  phone_number: string;

  @ApiProperty({
    example: 4000,
    description: "Amount of airtime, not a formatted amount",
  })
  amount: number;
}

export class ValidateMeterNoDto {
  @ApiProperty({
    example: "1111111111111",
    description: "Meter number.",
  })
  meter_no: string;

  @ApiProperty({
    example: "ikeja-electric",
    description: "Service ID.",
  })
  serviceID: string;

  @ApiProperty({
    example: "prepaid",
    description: "Type",
  })
  meter_type: string;
}

export class IElectricityPurchaseDto {
  @ApiProperty({
    example: "1111111111111",
    description: "Meter number.",
  })
  meter_no: string;

  @ApiProperty({
    example: "ikeja-electric",
    description: "Service ID.",
  })
  serviceID: string;

  @ApiProperty({
    example: "prepaid",
    description: "Meter type",
  })
  meter_type: string;

  @ApiProperty({
    example: "2000",
    description: "amount",
  })
  amount: number;

  @ApiProperty({
    example: "08102721331",
    description: "Phone number of the recipient",
  })
  phone_number: string;

  @ApiProperty({ example: 1, description: "Budget category" })
  budget_category_id: number;

  @ApiProperty({
    nullable: true,
    example: 1,
    description: "Budget subcategory category if a category is a subcategory.",
  })
  budget_sub_category_id?: number;

  @ApiProperty({
    example: "Payment for fuel purchase.",
    description: "Business purpose",
  })
  business_purpose: string;

  @ApiProperty({
    example: "due date for the purchase.",
    description: "Due date",
  })
  due_at?: string;

  @ApiProperty({
    example: "Recipient nmae.",
    description: "Customer name gotten from meter number validation",
  })
  recipient_name?: string;
}
