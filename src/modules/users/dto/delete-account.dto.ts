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
    description: "6-digit confirmation code sent to email",
    example: "123456",
  })
  confirmationCode: string;
}
