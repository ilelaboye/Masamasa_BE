# Disposable Wallet Setup Instructions

## Prerequisites

Before running the disposable wallet feature, you need to install the required dependencies and run the database migration.

## Installation Steps

### 1. Install QRCode Package

```bash
npm install qrcode
npm install --save-dev @types/qrcode
```

### 2. Run Database Migration

```bash
npm run db:migration-up
```

This will create the `disposable_wallets` table with all necessary indexes.

### 3. Verify Installation

Start your application:

```bash
npm run dev
```

Check the logs to ensure the DisposableWalletService is loaded without errors.

## Configuration

The disposable wallet service uses your existing wallet configuration from `.env`:

- `MASTER_MNEMONIC` - For EVM chains (Base, ETH, BSC, Polygon)
- `SOL_MASTER_MNEMONIC` - For Solana
- `TRX_MASTER_MNEMONIC` - For Tron
- `ADA_MASTER_MNEMONIC` - For Cardano
- `BTC_MASTER_MNEMONIC` - For Bitcoin
- `XRP_RPC_URL` - For Ripple

Ensure all these are properly configured in your `.env` file.

## Testing

### Test Wallet Creation

```bash
curl -X POST http://localhost:3000/web3/disposable/create \
  -H "Content-Type: application/json" \
  -H "Cookie: your-auth-cookie" \
  -d '{
    "network": "BASE",
    "tokenSymbol": "USDT",
    "expectedAmount": 10,
    "expirationMinutes": 60
  }'
```

### Test Wallet Check

```bash
curl -X POST http://localhost:3000/web3/disposable/check \
  -H "Content-Type: application/json" \
  -H "Cookie: your-auth-cookie" \
  -d '{
    "address": "0xYourWalletAddress",
    "network": "BASE"
  }'
```

## Cron Jobs

The service includes two automated cron jobs:

1. **Auto-Sweep (Every 5 minutes)**
   - Automatically sweeps funded wallets
   - Processes up to 50 wallets per cycle
   - Retries failed sweeps up to 3 times

2. **Expiration Cleanup (Daily at midnight)**
   - Marks pending wallets past expiration as expired
   - Keeps historical records for auditing

## Database Indexes

The migration creates the following indexes for performance:

- `IDX_DISPOSABLE_WALLET_ADDRESS` - Fast address lookups
- `IDX_DISPOSABLE_WALLET_STATUS` - Efficient status filtering
- `IDX_DISPOSABLE_WALLET_NETWORK` - Network-based queries
- `IDX_DISPOSABLE_WALLET_EXPIRES_AT` - Expiration cleanup

## API Endpoints

After setup, the following endpoints will be available:

- `POST /web3/disposable/create` - Create new disposable wallet
- `POST /web3/disposable/check` - Check wallet status
- `POST /web3/disposable/sweep` - Manually sweep wallet
- `GET /web3/disposable/list` - List all wallets with filters
- `GET /web3/disposable/statistics` - Get usage statistics

## Security Notes

1. Disposable wallets start from index 1,000,000 to avoid collision with regular user wallets
2. All private keys are derived from HD wallets (never stored in database)
3. Wallets automatically expire after configured time
4. Failed sweeps are marked and require manual intervention after 3 attempts

## Monitoring

### Check Service Health

```bash
curl http://localhost:3000/web3/disposable/statistics
```

Should return:
```json
{
  "total": 0,
  "byStatus": {
    "pending": 0,
    "funded": 0,
    "swept": 0,
    "expired": 0,
    "failed": 0
  }
}
```

### Monitor Logs

Watch for these log messages:

- `Running auto-sweep for funded disposable wallets...` - Every 5 minutes
- `✅ Swept {network} wallet {address}` - Successful sweep
- `❌ Failed to sweep {address}` - Failed sweep (needs attention)
- `Expiring old disposable wallets...` - Daily at midnight

## Troubleshooting

### Issue: "DisposableWalletService not found"

**Solution:** Ensure you've added the service to `web3.module.ts` providers array.

### Issue: Migration fails

**Solution:** Check if the `users` table exists. The migration depends on it for the foreign key.

### Issue: QR code generation fails

**Solution:** Install qrcode package:
```bash
npm install qrcode @types/qrcode
```

### Issue: Sweep fails repeatedly

**Possible causes:**
1. Insufficient gas in master wallet
2. RPC endpoint down or rate-limited
3. Network congestion (high gas fees)
4. Token contract issues

**Solution:** Check error logs and master wallet balances.

## Performance Optimization

For high-volume usage:

1. **Database Connection Pool:** Increase pool size in `typeorm.config.ts`
2. **RPC Endpoints:** Use premium RPC providers for faster responses
3. **Cron Frequency:** Adjust sweep frequency based on volume
4. **Batch Processing:** Increase wallets per cycle (default: 50)

## Migration Rollback

If you need to remove the disposable wallet feature:

```bash
npm run db:migration-down
```

This will drop the `disposable_wallets` table and all indexes.

## Support

For issues or questions, refer to:
- `DISPOSABLE_WALLET_API.md` - Complete API documentation
- Application logs in `public/logs/`
- Database records in `disposable_wallets` table
