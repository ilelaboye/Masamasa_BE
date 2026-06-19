import { ApiProperty } from "@nestjs/swagger";

export class DeleteAccountDto {
  @ApiProperty({
    description: "User password for confirmation",
    example: "MySecurePassword123!",
  })
  password: string;

  @ApiProperty({
    description: "Reason for deleting account (optional)",
    example: "No longer need the service",
    required: false,
  })
  reason?: string;
}

export class ConfirmDeleteAccountDto {
  @ApiProperty({
    description: "Confirmation value (must be 1 to confirm deletion)",
    example: 1,
  })
  confirmation: number;
}
