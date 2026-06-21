# Disposable Wallet Expiration Feature

## Overview
Added `expired_at` timestamp field to the main `wallet` table to distinguish between regular wallets and disposable wallets, making it easy to identify and query expired wallets.

## Changes Made

### 1. Database Schema

#### Added Column to `wallet` Table
- **Column**: `expired_at` (timestamp, nullable)
- **Purpose**: 
  - For **disposable wallets**: Set to expiration time (default 30 minutes from creation)
  - For **regular wallets**: Remains `NULL`

#### Migration
- **File**: `src/db/migrations/1775900000000-addExpiredAtToWalletTable.ts`
- **Action**: Adds `expired_at` column to existing `wallet` table

### 2. Entity Updates

#### `Wallet` Entity (`src/modules/wallet/wallet.entity.ts`)
```typescript
@Column({ type: "timestamp", nullable: true })
expired_at: Date | null;
```

### 3. Service Updates

#### `DisposableWalletService` (`src/modules/web3/services/disposable-wallet.service.ts`)

**Added:**
- Injected `Wallet` repository alongside `DisposableWallet` repository
- Created wallet entry in main `wallet` table when creating disposable wallet
- Set `expired_at` to match the disposable wallet expiration time
- Added `getDefaultCurrency()` helper method to map network to currency symbol

**Implementation:**
```typescript
// Also save to main wallet table with expired_at set
if (userId) {
  const walletEntry = this.walletRepository.create({
    user: { id: userId } as User,
    network,
    currency: dto.tokenSymbol?.toUpperCase() || this.getDefaultCurrency(network),
    wallet_address: address,
    expired_at: expiresAt, // Set expiration for disposable wallet
  });

  await this.walletRepository.save(walletEntry);
}
```

## Benefits

### 1. Easy Identification
```sql
-- Get all disposable wallets
SELECT * FROM wallet WHERE expired_at IS NOT NULL;

-- Get all regular wallets
SELECT * FROM wallet WHERE expired_at IS NULL;

-- Get expired disposable wallets
SELECT * FROM wallet WHERE expired_at IS NOT NULL AND expired_at < NOW();

-- Get active disposable wallets
SELECT * FROM wallet WHERE expired_at IS NOT NULL AND expired_at > NOW();
```

### 2. Single Source of Truth
- Both regular and disposable wallets in one table
- Easy to query wallet balances regardless of type
- Unified wallet management across the application

### 3. Timeline-Based Tracking
- Clear timestamp for when wallet expires
- Can be used for automatic cleanup jobs
- Easy to filter wallets by expiration status

## Usage Example

### Creating Disposable Wallet
```typescript
POST /web3/disposable/create
{
  "network": "ETHEREUM",
  "tokenSymbol": "USDT",
  "expirationMinutes": 30,  // Defaults to 60 if not provided
  "expectedAmount": 100
}
```

**Result:**
- Creates entry in `disposable_wallet` table
- Creates entry in `wallet` table with `expired_at` = NOW() + 30 minutes

### Creating Regular Wallet
```typescript
POST /wallet/create
{
  "network": "ETHEREUM",
  "currency": "ETH"
}
```

**Result:**
- Creates entry in `wallet` table with `expired_at` = NULL

## Database Query Examples

### Find Wallets Expiring Soon
```sql
SELECT * FROM wallet 
WHERE expired_at IS NOT NULL 
  AND expired_at BETWEEN NOW() AND NOW() + INTERVAL '5 minutes'
ORDER BY expired_at ASC;
```

### Count by Expiration Status
```sql
SELECT 
  COUNT(CASE WHEN expired_at IS NULL THEN 1 END) as regular_wallets,
  COUNT(CASE WHEN expired_at IS NOT NULL AND expired_at > NOW() THEN 1 END) as active_disposable,
  COUNT(CASE WHEN expired_at IS NOT NULL AND expired_at <= NOW() THEN 1 END) as expired_disposable
FROM wallet;
```

### User's Disposable Wallets
```sql
SELECT * FROM wallet 
WHERE user_id = 123 
  AND expired_at IS NOT NULL
ORDER BY created_at DESC;
```

## Migration Instructions

1. Run the migration:
```bash
npm run migration:run
```

2. The migration will add the `expired_at` column to the existing `wallet` table
3. All existing wallets will have `expired_at` = NULL (regular wallets)
4. New disposable wallets will automatically get `expired_at` timestamp

## Notes

- **Backward Compatible**: Existing wallets are not affected (expired_at = NULL)
- **No Breaking Changes**: Regular wallet creation flow unchanged
- **Automatic Expiration**: Disposable wallets automatically set expiration based on `expirationMinutes` parameter
- **Default Expiration**: 30 minutes if not specified (configurable via API)
