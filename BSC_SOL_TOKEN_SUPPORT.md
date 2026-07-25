# BSC SOL Token Support Added

## Summary
Added support for sweeping **SOL token on Binance Smart Chain (BSC/BEP20)**, not to be confused with native SOL on Solana network.

## Token Details

### BNB_SOL (Wrapped Solana on BSC)
- **Network:** Binance Smart Chain (BSC)
- **Token Standard:** BEP20
- **Contract Address:** `0x570A5D26f7765Ecb712C0924E4De545B89fD43dF`
- **Symbol:** SOL
- **Name:** Wrapped Solana (or Binance-Peg Solana Token)

## What Was Added

### 1. Token Address Configuration
Added to all `ERC20_TOKENS` definitions across the codebase:
```typescript
BNB_SOL: "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF", // BSC SOL (Wrapped Solana)
```

### 2. Sweep Functionality
Added sweep operation in `sweepWallets()` method:
```typescript
try {
  await this.hd.sweepToken(
    childWallet2,
    masterWallet,
    ERC20_TOKENS["BNB_SOL"],
    "BINANCE CHAIN",
    "SOL",
  );
} catch (e) {}
```

### 3. Balance Checking
Added balance retrieval for BSC SOL:
```typescript
const BNBSOL = await this.hd.getERC20Balance(
  masterWallet,
  ERC20_TOKENS["BNB_SOL"],
);
```

### 4. Balance Response
Updated the balance response to include SOL:
```typescript
binance: {
  BNB: bnbBalance,
  USDT: BNBUSDT,
  USDC: BNBUSDC,
  BTC: BNBBTC,
  ETH: BNBETH,
  RIPPLE: BNBRIPPLE,
  DOGE: BNBDOGE,
  ADA: BNBADA,
  SOL: BNBSOL,  // ← NEW
},
```

## Files Modified

1. **src/modules/web3/web3.service.ts**
   - Added BNB_SOL to 4 different ERC20_TOKENS definitions
   - Added sweep operation for BNB_SOL
   - Added balance check for BNB_SOL
   - Updated balance response to include BNB_SOL

2. **src/modules/web3/services/disposable-wallet.service.ts**
   - Added BNB_SOL to token address mapping

## Usage Examples

### 1. Automatic Sweep
When `/web3/sweep` is called, it will now automatically sweep SOL tokens from BSC:
```bash
GET /web3/sweep
```

### 2. Check Balance
Get master wallet balances including BSC SOL:
```bash
GET /web3/balance
```

**Response includes:**
```json
{
  "binance": {
    "BNB": 1.5,
    "USDT": 100,
    "USDC": 50,
    "BTC": 0.01,
    "ETH": 0.5,
    "RIPPLE": 500,
    "DOGE": 1000,
    "ADA": 100,
    "SOL": 25.5
  }
}
```

### 3. Withdraw BSC SOL
```bash
POST /web3/withdraw-token

{
  "network": "BSC",
  "symbol": "SOL",
  "to": "0xRecipientAddress",
  "amount": 10
}
```

## Network Clarification

⚠️ **Important:** There are TWO different SOL tokens in the system:

| Token | Network | Type | Contract/Mint Address |
|-------|---------|------|----------------------|
| **Native SOL** | Solana | Native Token | N/A (native) |
| **BNB_SOL** | BSC | BEP20 Token | `0x570A5D26f7765Ecb712C0924E4De545B89fD43dF` |

### When to Use Each:

1. **Native SOL (Solana Network)**
   - For deposits/withdrawals on Solana blockchain
   - Uses Solana addresses (starts with letters/numbers, e.g., `9iZjXvvQK...`)
   - Fastest and cheapest for Solana ecosystem

2. **BNB_SOL (BSC Network)**
   - For deposits/withdrawals on Binance Smart Chain
   - Uses Ethereum-compatible addresses (starts with `0x...`)
   - Can be traded on BSC DEXes
   - Wrapped/bridged version of Solana token

## Complete Token List on BSC

Your system now supports these BEP20 tokens on BSC:

1. **BNB** (native)
2. **USDT** - Tether
3. **USDC** - USD Coin
4. **BTC** - Wrapped Bitcoin
5. **ETH** - Wrapped Ethereum
6. **XRP** - Wrapped Ripple
7. **DOGE** - Wrapped Dogecoin
8. **ADA** - Wrapped Cardano
9. **SOL** - Wrapped Solana ← **NEW**

## Testing

To test the new functionality:

1. **Send SOL to a user wallet on BSC:**
   - Get user's BSC wallet address
   - Send BEP20 SOL tokens to that address
   - Contract: `0x570A5D26f7765Ecb712C0924E4De545B89fD43dF`

2. **Trigger sweep:**
   ```bash
   GET /web3/sweep
   ```

3. **Verify balance:**
   ```bash
   GET /web3/balance
   ```
   Check the `binance.SOL` field

4. **Test withdrawal:**
   ```bash
   POST /web3/withdraw-token
   {
     "network": "BSC",
     "symbol": "SOL",
     "to": "0xYourAddress",
     "amount": 1
   }
   ```

## Smart Contract Verification

You can verify the BNB_SOL token contract on BscScan:
- **Contract:** https://bscscan.com/token/0x570A5D26f7765Ecb712C0924E4De545B89fD43dF
- **Network:** BSC Mainnet
- **Standard:** BEP20 (ERC20-compatible)

## Notes

- Sweep operations run automatically when `/web3/sweep` is called
- All BSC operations use the same master mnemonic: `MASTER_MNEMONIC` in `.env`
- Child wallet derivation follows BIP44 standard: `m/44'/60'/0'/0/{userId}`
- Gas fees paid in BNB (not SOL)
- Transactions visible on BscScan, not Solana Explorer
