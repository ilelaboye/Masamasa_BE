# Disposable Wallet Sweep Trigger

## Overview
Added a simple sweep trigger function for disposable wallets, similar to the regular wallet `/sweep` endpoint. This allows you to sweep all funded disposable wallets with a single API call.

## New Endpoint

### `GET /web3/disposable/sweep-all`

**Description:** Sweep all funded disposable wallets or a specific wallet

**Authentication:** Required (uses JWT from request)

**Query Parameters:**
- `address` (optional): Specific wallet address to sweep
- `network` (optional): Filter by network (BASE, ETH, BSC, POLYGON, SOLANA, TRON, BITCOIN, CARDANO, RIPPLE, DOGE)

**Behavior:**
1. **No parameters:** Sweeps ALL funded disposable wallets for the authenticated user
2. **With network:** Sweeps all funded disposable wallets on that network for the user
3. **With address + network:** Sweeps only that specific wallet

## Usage Examples

### 1. Sweep All Funded Disposable Wallets
```bash
GET /web3/disposable/sweep-all
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Swept 5 of 8 wallets",
  "total": 8,
  "success": 5,
  "failed": 3,
  "swept": [
    {
      "address": "0x1234...",
      "network": "ETHEREUM",
      "txHash": "0xabc..."
    },
    {
      "address": "So11...",
      "network": "SOLANA",
      "txHash": "2ZE3..."
    }
  ],
  "errors": [
    {
      "address": "0x5678...",
      "network": "BASE",
      "error": "Already swept"
    },
    {
      "address": "0x9abc...",
      "network": "BSC",
      "error": "Wallet expired"
    },
    {
      "address": "0xdef0...",
      "network": "POLYGON",
      "error": "Sweep failed - insufficient balance or network error"
    }
  ]
}
```

### 2. Sweep All Funded Wallets on Specific Network
```bash
GET /web3/disposable/sweep-all?network=ETHEREUM
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Swept 2 of 3 wallets",
  "total": 3,
  "success": 2,
  "failed": 1,
  "swept": [
    {
      "address": "0x1234...",
      "network": "ETHEREUM",
      "txHash": "0xabc..."
    },
    {
      "address": "0x5678...",
      "network": "ETHEREUM",
      "txHash": "0xdef..."
    }
  ],
  "errors": [
    {
      "address": "0x9abc...",
      "network": "ETHEREUM",
      "error": "Insufficient balance"
    }
  ]
}
```

### 3. Sweep Specific Wallet
```bash
GET /web3/disposable/sweep-all?address=0x1234...&network=ETHEREUM
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Swept 1 of 1 wallets",
  "total": 1,
  "success": 1,
  "failed": 0,
  "swept": [
    {
      "address": "0x1234...",
      "network": "ETHEREUM",
      "txHash": "0xabc..."
    }
  ],
  "errors": []
}
```

## Comparison with Existing Endpoints

### Regular Wallet Sweep
```bash
GET /web3/sweep
```
- Sweeps the authenticated user's regular wallet (single wallet per user)
- Sweeps all networks and tokens for that user
- Used for regular user wallets (one wallet per user)

### Manual Disposable Wallet Sweep (Existing)
```bash
POST /web3/disposable/sweep
{
  "address": "0x1234...",
  "network": "ETHEREUM"
}
```
- Sweeps ONE specific disposable wallet
- Requires explicit address and network in body
- Used for manual, targeted sweeps

### NEW: Sweep All Disposable Wallets (Trigger)
```bash
GET /web3/disposable/sweep-all
```
- Sweeps ALL funded disposable wallets for the user
- Optional filtering by network or specific address
- Similar to `/sweep` but for disposable wallets
- **Simple trigger** - just call it and it sweeps everything

## Implementation Details

### Service Method: `sweepDisposableWallets()`

**Location:** `src/modules/web3/services/disposable-wallet.service.ts`

**Logic:**
1. Query all funded disposable wallets (status = FUNDED)
2. Apply optional filters (network, userId, specific address)
3. Loop through each wallet and attempt sweep
4. Skip wallets that are already swept or expired
5. Update wallet status and store transaction hash
6. Return detailed results with success/failure counts

**Error Handling:**
- Catches errors per wallet (doesn't fail entire operation)
- Continues to next wallet if one fails
- Returns detailed error messages for each failure

### Wallet Status Flow
```
PENDING → FUNDED → SWEPT
            ↓
        EXPIRED
```

- Only wallets with status `FUNDED` are swept
- After successful sweep: status → `SWEPT`
- Expired wallets are skipped with error message

## Use Cases

### 1. Scheduled Cleanup
```javascript
// Cron job to sweep all funded wallets every hour
setInterval(() => {
  fetch('/web3/disposable/sweep-all', {
    headers: { Authorization: 'Bearer <admin-token>' }
  });
}, 3600000); // 1 hour
```

### 2. User Dashboard "Sweep All" Button
```javascript
// Frontend button to sweep all user's disposable wallets
async function sweepAllMyWallets() {
  const response = await fetch('/web3/disposable/sweep-all', {
    headers: { Authorization: `Bearer ${userToken}` }
  });
  
  const result = await response.json();
  alert(`Swept ${result.success} wallets successfully!`);
}
```

### 3. Network-Specific Sweep
```javascript
// Sweep only Ethereum wallets
async function sweepEthereumWallets() {
  const response = await fetch('/web3/disposable/sweep-all?network=ETHEREUM', {
    headers: { Authorization: `Bearer ${userToken}` }
  });
  
  return await response.json();
}
```

### 4. Single Wallet Quick Sweep
```javascript
// Quick sweep of a specific wallet
async function quickSweep(address, network) {
  const response = await fetch(
    `/web3/disposable/sweep-all?address=${address}&network=${network}`,
    { headers: { Authorization: `Bearer ${userToken}` } }
  );
  
  return await response.json();
}
```

## Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `message` | string | Summary message |
| `total` | number | Total wallets processed |
| `success` | number | Number of successful sweeps |
| `failed` | number | Number of failed sweeps |
| `swept` | array | List of successfully swept wallets with tx hashes |
| `errors` | array | List of failed wallets with error messages |

### Swept Wallet Object
```typescript
{
  address: string;      // Wallet address
  network: string;      // Network name
  txHash: string;       // Transaction hash
}
```

### Error Object
```typescript
{
  address: string;      // Wallet address
  network: string;      // Network name
  error: string;        // Error message
}
```

## Security Considerations

1. **Authentication Required:** Endpoint requires valid JWT token
2. **User Isolation:** Only sweeps wallets belonging to authenticated user
3. **Status Validation:** Only sweeps wallets with FUNDED status
4. **Idempotent:** Safe to call multiple times (skips already swept wallets)
5. **Error Isolation:** One wallet failure doesn't affect others

## Testing

### Test All Scenarios
```bash
# 1. Sweep all funded wallets
curl -X GET "http://localhost:3000/web3/disposable/sweep-all" \
  -H "Authorization: Bearer <token>"

# 2. Sweep specific network
curl -X GET "http://localhost:3000/web3/disposable/sweep-all?network=ETHEREUM" \
  -H "Authorization: Bearer <token>"

# 3. Sweep specific wallet
curl -X GET "http://localhost:3000/web3/disposable/sweep-all?address=0x123&network=ETHEREUM" \
  -H "Authorization: Bearer <token>"

# 4. Test with no funded wallets (should return empty)
curl -X GET "http://localhost:3000/web3/disposable/sweep-all" \
  -H "Authorization: Bearer <token>"
```

## Benefits

1. **Simple Trigger:** One endpoint to sweep everything
2. **Batch Processing:** Handles multiple wallets in single call
3. **Robust:** Continues even if some wallets fail
4. **Detailed Results:** Shows exactly what succeeded and what failed
5. **Flexible:** Can target all wallets, specific network, or single wallet
6. **Safe:** Validates status, prevents double-sweeps, isolates errors

## Future Enhancements

- Add pagination for large number of wallets
- Add dry-run mode to preview what would be swept
- Add minimum balance threshold filter
- Add webhook notification on completion
- Add admin endpoint to sweep all users' wallets
