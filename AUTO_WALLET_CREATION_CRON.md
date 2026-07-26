# Auto Wallet Creation Cron Job

## Overview
Automatically creates wallets for all users who don't have any wallets yet. This ensures that every user has their crypto wallets set up before any sweep operations run.

## Implementation

### Location
`src/modules/web3/wallet-tracking.cron.ts`

### Cron Schedule
- **Frequency**: Every 10 minutes
- **Cron Expression**: `*/10 * * * *`

### How It Works

1. **Fetches all users** from the database
2. **Checks each user** to see if they have any wallets
3. **Creates wallets** for users with no existing wallets by calling `web3Service.createWallet()`
4. **Logs the process** with detailed information about which users got wallets created

### Wallets Created Per User

When `createWallet()` is called, it creates wallets for the following networks:

1. **Bitcoin (BTC)** - BITCOIN network
2. **Cardano (ADA)** - CARDANO network  
3. **Base (ETH)** - Base network + all EVM networks
4. **Solana (SOL)** - SOLANA network + USDT on Solana
5. **TRON (TRX)** - TRON network
6. **Dogecoin (DOGE)** - DOGE network
7. **Ripple (XRP)** - RIPPLE network (with destination tag)
8. **All EVM tokens** - Automatically creates wallets for all supported ERC20/BEP20 tokens

### Benefits

✅ **No manual wallet creation needed** - New users automatically get wallets
✅ **Prevents sweep errors** - Ensures wallets exist before sweep operations
✅ **Runs independently** - Separate from the main wallet tracking cron
✅ **Error handling** - If wallet creation fails for one user, continues with others
✅ **Efficient** - Only creates wallets for users who don't have any

### Cron Jobs in System

#### 1. Auto Wallet Creation (NEW)
- **Frequency**: Every 10 minutes
- **Purpose**: Create wallets for users without any wallets
- **Method**: `ensureAllUsersHaveWallets()`

#### 2. Wallet Tracking & Sweep
- **Frequency**: Every 5 minutes
- **Purpose**: Track deposits and sweep funds to master wallets
- **Method**: `trackAllWallets()`

### Execution Flow

```
Every 10 minutes:
├── Fetch all users from database
├── For each user:
│   ├── Check if user has any wallets
│   ├── If NO wallets found:
│   │   ├── Call createWallet(user)
│   │   ├── Creates BTC wallet
│   │   ├── Creates ADA wallet
│   │   ├── Creates ETH/Base wallet
│   │   ├── Creates SOL wallet
│   │   ├── Creates TRX wallet
│   │   ├── Creates DOGE wallet
│   │   ├── Creates XRP wallet
│   │   └── Creates all EVM token wallets
│   └── Log success/failure
└── Log total wallets created
```

### Logs Example

```
[WalletTrackingCron] START AUTO-CREATE WALLETS FOR USERS WITHOUT WALLETS
[WalletTrackingCron] Checking 150 users for wallet creation
[WalletTrackingCron] Creating wallets for user ID 45 (user@example.com)
[WalletTrackingCron] ✅ Wallets created successfully for user 45
[WalletTrackingCron] Creating wallets for user ID 78 (newuser@example.com)
[WalletTrackingCron] ✅ Wallets created successfully for user 78
[WalletTrackingCron] ✅ Wallet creation completed. Created wallets for 2 users
```

### Error Handling

If wallet creation fails for a specific user:
- Error is logged with user ID and error message
- Process continues with the next user
- Does not stop the entire cron job

### Testing

#### Check if cron is running:
```bash
# Check application logs for:
"START AUTO-CREATE WALLETS FOR USERS WITHOUT WALLETS"
```

#### Manually test wallet creation:
1. Create a new user account
2. Wait 10 minutes (or trigger cron manually if possible)
3. Check the `wallet` table for the new user's wallets
4. Verify all networks have been created (BTC, ADA, ETH, SOL, TRX, DOGE, XRP)

#### Query to check users without wallets:
```sql
SELECT u.id, u.email, COUNT(w.id) as wallet_count
FROM users u
LEFT JOIN wallet w ON w.user_id = u.id
GROUP BY u.id, u.email
HAVING COUNT(w.id) = 0;
```

### Configuration

No additional configuration needed. The cron job uses:
- Existing HD wallet configurations from `.env`
- Existing wallet repository
- Existing `createWallet()` method from `Web3Service`

### Module Registration

Already registered in `src/modules/web3/web3.module.ts`:
```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, User, ...]),
    ...
  ],
  providers: [
    WalletTrackingCron, // ✅ Already registered
    ...
  ],
})
```

### Dependencies

- **User Repository** - To fetch all users
- **Wallet Repository** - To check existing wallets
- **Web3Service** - To call `createWallet()` method

## Troubleshooting

### Issue: Cron not running
**Solution**: Check if `@nestjs/schedule` module is imported in `app.module.ts`

### Issue: Wallets not being created
**Solution**: 
1. Check logs for error messages
2. Verify HD wallet mnemonics are set in `.env`
3. Ensure database connection is working
4. Check if `createWallet()` method is working manually

### Issue: Duplicate wallets
**Solution**: The cron checks if user has ANY wallets before creating, so duplicates shouldn't occur. If they do, check the wallet table for unique constraints.

## Future Enhancements

- Add notification when wallets are auto-created
- Add webhook to notify external systems
- Add option to recreate missing individual network wallets
- Add metrics/stats on wallet creation
