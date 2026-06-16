import { ApiProperty } from "@nestjs/swagger";

export class CreateDisposableWalletDto {
  @ApiProperty({ 
    description: "Network to create wallet on",
    enum: ["BASE", "ETH", "BSC", "POLYGON", "SOLANA", "TRON", "BITCOIN", "CARDANO", "RIPPLE", "DOGE"],
    example: "BASE"
  })
  network: string;

  @ApiProperty({ 
    description: "Expected amount to receive (optional, for validation)",
    required: false,
    example: 100
  })
  expectedAmount?: number;

  @ApiProperty({ 
    description: "Token symbol (for ERC20/TRC20 tokens)",
    required: false,
    example: "USDT"
  })
  tokenSymbol?: string;

  @ApiProperty({ 
    description: "Expiration time in minutes (default: 60)",
    required: false,
    example: 60
  })
  expirationMinutes?: number;

  @ApiProperty({ 
    description: "Metadata for tracking",
    required: false
  })
  metadata?: Record<string, any>;
}

export class DisposableWalletResponseDto {
  @ApiProperty({ description: "Disposable wallet address" })
  address: string;

  @ApiProperty({ description: "Network" })
  network: string;

  @ApiProperty({ description: "Token symbol (if applicable)" })
  tokenSymbol?: string;

  @ApiProperty({ description: "Destination tag (for XRP)" })
  destinationTag?: number;

  @ApiProperty({ description: "Expiration timestamp" })
  expiresAt: Date;

  @ApiProperty({ description: "QR code data URL" })
  qrCode?: string;

  @ApiProperty({ description: "Status" })
  status: string;

  @ApiProperty({ description: "Expected amount" })
  expectedAmount?: number;
}

export class CheckDisposableWalletDto {
  @ApiProperty({ description: "Disposable wallet address" })
  address: string;

  @ApiProperty({ description: "Network" })
  network: string;

  @ApiProperty({ 
    description: "Destination tag (for XRP)",
    required: false
  })
  destinationTag?: number;
}

export class SweepDisposableWalletDto {
  @ApiProperty({ description: "Disposable wallet address" })
  address: string;

  @ApiProperty({ description: "Network" })
  network: string;

  @ApiProperty({ 
    description: "Token symbol (for ERC20/TRC20 tokens)",
    required: false
  })
  tokenSymbol?: string;

  @ApiProperty({ 
    description: "Destination tag (for XRP)",
    required: false
  })
  destinationTag?: number;
}
