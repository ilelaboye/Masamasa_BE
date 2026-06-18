# Disposable Wallet API Documentation

## Overview

The Disposable Wallet API allows you to create temporary, one-time-use cryptocurrency wallets across multiple blockchain networks. These wallets are ideal for payment processing, invoicing, and situations where you need unique receiving addresses that automatically sweep funds to your master wallet.

## Supported Networks

- **Ethereum (ETH)** - Layer 1 blockchain
- **Base** - Ethereum Layer 2
- **Binance Smart Chain (BSC/BNB)** - Fast and low-cost EVM chain
- **Polygon (MATIC)** - Ethereum sidechain
- **Solana (SOL)** - High-performance blockchain
- **Tron (TRX)** - DeFi-focused blockchain
- **Bitcoin (BTC)** - Original cryptocurrency
- **Cardano (ADA)** - Proof-of-Stake blockchain
- **Ripple (XRP)** - Enterprise payment network
- **Dogecoin (DOGE)** - Popular meme coin

## Supported Tokens

### ERC-20 Tokens (Ethereum/Base/BSC/Polygon)
- USDT, USDC, BTC, ETH, BNB, ADA, XRP, DOGE

### SPL Tokens (Solana)
- USDT, USDC

### TRC-20 Tokens (Tron)
- USDT

## API Endpoints

### 1. Create Disposable Wallet

**Endpoint:** `POST /web3/disposable/create`

**Description:** Creates a new temporary wallet for receiving cryptocurrency.

**Request Body:**
```json
{
  "network": "BASE",
  "tokenSymbol": "USDT",
  "expectedAmount": 100,
  "expirationMinutes": 60,
  "metadata": {
    "orderId": "ORD-12345",
    "customerEmail": "customer@example.com"
  }
}
```

**Parameters:**
- `network` (required): Network name (BASE, ETH, BSC, POLYGON, SOLANA, TRON, BITCOIN, CARDANO, RIPPLE, DOGE)
- `tokenSymbol` (optional): Token to receive (USDT, USDC, etc.). Omit for native tokens.
- `expectedAmount` (optional): Expected amount for validation/display
- `expirationMinutes` (optional): Wallet expiration time (default: 60, max: 10080 = 7 days)
- `metadata` (optional): Custom data for tracking

**Response:**
```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "network": "BASE",
  "tokenSymbol": "USDT",
  "destinationTag": null,
  "expiresAt": "2024-01-15T15:30:00Z",
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
  "status": "pending",
  "expectedAmount": 100
}
```

**Use Cases:**
- Invoice generation
- Payment processing
- Donation collection
- E-commerce checkout

---

### 2. Check Wallet Status

**Endpoint:** `POST /web3/disposable/check`

**Description:** Check the balance and status of a disposable wallet.

**Request Body:**
```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "network": "BASE",
  "destinationTag": null
}
```

**Response:**
```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "network": "BASE",
  "tokenSymbol": "USDT",
  "destinationTag": null,
  "balance": 100.5,
  "expectedAmount": 100,
  "receivedAmount": 100.5,
  "status": "funded",
  "expiresAt": "2024-01-15T15:30:00Z",
  "createdAt": "2024-01-15T14:30:00Z",
  "fundedAt": "2024-01-15T14:35:00Z",
  "sweptAt": null,
  "sweepTxHash": null
}
```

**Status Values:**
- `pending` - Waiting for funds
- `funded` - Received funds
- `swept` - Funds transferred to master wallet
- `expired` - Wallet expired without receiving funds
- `failed` - Sweep operation failed

---

### 3. Manually Sweep Wallet

**Endpoint:** `POST /web3/disposable/sweep`

**Description:** Manually trigger a sweep of funds from disposable wallet to master wallet.

**Request Body:**
```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "network": "BASE",
  "tokenSymbol": "USDT"
}
```

**Response:**
```json
{
  "success": true,
  "txHash": "0xabc123...",
  "message": "Wallet swept successfully"
}
```

**Note:** Auto-sweep runs every 5 minutes, so manual sweep is optional.

---

### 4. List Disposable Wallets

**Endpoint:** `GET /web3/disposable/list`

**Description:** List all disposable wallets with optional filters.

**Query Parameters:**
- `status` (optional): Filter by status (pending, funded, swept, expired, failed)
- `network` (optional): Filter by network
- `limit` (optional): Results per page (default: 50, max: 100)
- `offset` (optional): Pagination offset (default: 0)

**Example:**
```
GET /web3/disposable/list?status=funded&network=BASE&limit=20&offset=0
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid-here",
      "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "network": "BASE",
      "tokenSymbol": "USDT",
      "status": "funded",
      "receivedAmount": 100.5,
      "createdAt": "2024-01-15T14:30:00Z",
      "fundedAt": "2024-01-15T14:35:00Z"
    }
  ],
  "total": 150,
  "limit": 20,
  "offset": 0
}
```

---

### 5. Get Statistics

**Endpoint:** `GET /web3/disposable/statistics`

**Description:** Get overall statistics about disposable wallets.

**Response:**
```json
{
  "total": 1250,
  "byStatus": {
    "pending": 45,
    "funded": 12,
    "swept": 1150,
    "expired": 38,
    "failed": 5
  }
}
```

---

## Network-Specific Notes

### Ripple (XRP)
- Uses destination tags instead of unique addresses
- Format: `rMasterAddress:44011XXX` where XXX is the derivation index
- Always include the destination tag when sending XRP
- The master address is shared; destination tag routes to correct wallet

### Cardano (ADA)
- Minimum balance: 1 ADA (network requirement)
- Automatic top-up occurs if balance is between 1-10 ADA before sweep
- Transactions may take 1-3 blocks to confirm

### Bitcoin (BTC)
- Uses Native SegWit (Bech32) addresses (bc1...)
- Dust limit: 546 satoshis
- Dynamic fee estimation based on network conditions

### Solana (SOL)
- Rent-exempt minimum: ~0.002 SOL for token accounts
- Auto-creates Associated Token Accounts (ATA) if needed
- Very fast confirmation (~400ms)

### Tron (TRX)
- Energy/Bandwidth consumption for transactions
- TRC-20 transfers may require TRX for fees
- Auto-funded from master if needed

---

## Auto-Sweep Mechanism

### How It Works

1. **Detection:** Cron job runs every 5 minutes
2. **Check Balance:** Queries blockchain for wallet balance
3. **Sweep:** If balance > 0 and status = "funded", initiates sweep
4. **Update:** Marks wallet as "swept" with transaction hash
5. **Retry Logic:** Retries up to 3 times on failure

### Sweep Priority

Wallets are processed in order:
1. Funded wallets (has balance)
2. Oldest first
3. Max 50 wallets per cycle

---

## Expiration & Cleanup

### Expiration

- Wallets expire after configured time (default: 60 minutes)
- Expired wallets with status "pending" are marked as "expired"
- Funded wallets don't expire until swept
- Daily cron job at midnight processes expirations

### Cleanup

- Expired wallets are kept in database for records
- No automatic deletion (for audit trail)
- Manual cleanup can be implemented if needed

---

## Security Best Practices

### For Disposable Wallets

1. **Short Expiration:** Use short expiration times (15-60 min)
2. **Expected Amount:** Set expected amount for validation
3. **Metadata:** Include order/transaction IDs for tracking
4. **Monitor Status:** Poll `/check` endpoint regularly
5. **Unique Usage:** Never reuse a swept/expired wallet

### For Integration

1. **HTTPS Only:** Always use HTTPS for API calls
2. **Authentication:** Ensure proper authentication headers
3. **Rate Limiting:** Implement rate limiting on your side
4. **Error Handling:** Handle network errors gracefully
5. **Webhooks:** Use transaction webhooks for real-time updates

---

## Integration Examples

### Example: Payment Flow

```javascript
// 1. Create disposable wallet when user initiates checkout
const wallet = await fetch('/web3/disposable/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    network: 'BASE',
    tokenSymbol: 'USDT',
    expectedAmount: 99.99,
    expirationMinutes: 30,
    metadata: {
      orderId: 'ORD-12345',
      userId: 'user-789'
    }
  })
});

const { address, qrCode, expiresAt } = await wallet.json();

// 2. Display QR code and address to user
displayPaymentInfo(address, qrCode, expiresAt);

// 3. Poll for payment confirmation
const checkInterval = setInterval(async () => {
  const status = await fetch('/web3/disposable/check', {
    method: 'POST',
    body: JSON.stringify({ address, network: 'BASE' })
  });
  
  const { status: walletStatus, receivedAmount } = await status.json();
  
  if (walletStatus === 'funded' || walletStatus === 'swept') {
    clearInterval(checkInterval);
    completeOrder(receivedAmount);
  }
  
  if (walletStatus === 'expired') {
    clearInterval(checkInterval);
    cancelOrder();
  }
}, 5000); // Check every 5 seconds
```

---

## Error Handling

### Common Errors

**400 Bad Request**
```json
{
  "statusCode": 400,
  "message": "Unsupported network: INVALID",
  "error": "Bad Request"
}
```

**404 Not Found**
```json
{
  "statusCode": 404,
  "message": "Disposable wallet not found",
  "error": "Not Found"
}
```

**500 Internal Server Error**
```json
{
  "statusCode": 500,
  "message": "Sweep failed - network error",
  "error": "Internal Server Error"
}
```

---

## Performance Notes

- **Creation:** < 100ms
- **Balance Check:** 500ms - 2s (depends on blockchain RPC)
- **Sweep:** 1s - 30s (depends on network congestion)
- **Database:** Indexed for fast queries
- **Cron Jobs:** Run independently, don't block API

---

## Limitations

1. **Derivation Index:** Max ~2 billion wallets per network (BIP44 limit)
2. **Concurrent Sweeps:** 50 wallets per 5-minute cycle
3. **Token Support:** Only pre-configured tokens (see list above)
4. **Network Fees:** Automatically deducted from sweep amount
5. **Minimum Amounts:** Each network has dust limits

---

## FAQ

**Q: Can I reuse a disposable wallet?**
A: No, disposable wallets are one-time use only. Create a new one for each transaction.

**Q: What happens if funds arrive after expiration?**
A: The wallet will still receive funds and auto-sweep will process them.

**Q: How long does a sweep take?**
A: 1-30 seconds depending on the network. Fast networks like Solana are ~1s, Bitcoin can be 10-30s.

**Q: Can I customize the derivation path?**
A: No, paths are fixed per BIP44 standard to ensure compatibility.

**Q: What if a sweep fails?**
A: The system retries up to 3 times. After that, status is marked "failed" and requires manual intervention.

**Q: Are there fees?**
A: Network fees are automatically deducted from the swept amount. No additional service fees.

---

## Support

For issues or questions:
- Check wallet status first
- Review error messages
- Verify network is not congested
- Check blockchain explorer for transaction status
- Contact support with wallet address and network info
