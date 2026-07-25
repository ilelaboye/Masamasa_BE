# TRON Wallet Details in Sweep Operations

## Overview
Enhanced TRON sweep operations now include comprehensive wallet details including address, private key, and derivation path.

## What Was Added

### 1. Enhanced `sweepTRON()` Method
**Location:** `src/modules/web3/tron-hd-wallet.ts`

Now returns detailed wallet information when sweeping TRX:

```typescript
async sweepTRON(
  child: { privateKey: string; address: string },
  masterAddressBase58: string,
  tronRpc: string,
  symbol: string = "TRX",
  childIndex?: number,  // ← NEW parameter
)
```

**Return Value:**
```typescript
{
  success: true,
  txHash: "abc123...",
  walletDetails: {
    address: "TLsEd7jJ5MhK6YRPYEY4rb4NZEePWKfQJL",
    privateKey: "5a1b2c3d...",
    derivationPath: "m/44'/195'/0'/0/34",
    network: "TRON",
    note: "🔐 Child wallet being swept to master"
  },
  sweepInfo: {
    from: "TLsEd7jJ5MhK6YRPYEY4rb4NZEePWKfQJL",
    to: "TLKtezKsvMT2Koez8LXGhgVmBvX9pAJSxK",
    amount: 98.5,
    fee: 1.5,
    network: "TRON"
  }
}
```

### 2. Enhanced `sweepTRC20()` Method
**Location:** `src/modules/web3/tron-hd-wallet.ts`

Now includes wallet details when sweeping TRC20 tokens (USDT, etc.):

```typescript
async sweepTRC20(
  child: { privateKey: string; address: string },
  master: { privateKey: string; address: string },
  tronRpc: string,
  tokenAddress: string,
  symbol: string = "USDT",
  childIndex?: number,  // ← NEW parameter
)
```

**Return Value:**
```typescript
{
  success: true,
  txHash: "def456...",
  walletDetails: {
    address: "TLsEd7jJ5MhK6YRPYEY4rb4NZEePWKfQJL",
    privateKey: "5a1b2c3d...",
    derivationPath: "m/44'/195'/0'/0/34",
    network: "TRON",
    tokenSymbol: "USDT",
    note: "🔐 Child wallet sweeping TRC20 tokens to master"
  },
  sweepInfo: {
    from: "TLsEd7jJ5MhK6YRPYEY4rb4NZEePWKfQJL",
    to: "TLKtezKsvMT2Koez8LXGhgVmBvX9pAJSxK",
    amount: 100.0,
    tokenSymbol: "USDT",
    network: "TRON"
  }
}
```

### 3. New Helper Methods

#### Get Master Mnemonic
```typescript
const mnemonic = hdTron.getMasterMnemonic();
// Returns: "marriage space fade require because rival wide flash moral rib drip little"
```

#### Get Child Wallet Details
```typescript
const details = hdTron.getChildWalletDetails(34);
// Returns:
// {
//   address: "TLsEd7jJ5MhK6YRPYEY4rb4NZEePWKfQJL",
//   privateKey: "abc123...",
//   path: "m/44'/195'/0'/0/34",
//   note: "Import this private key into TronLink or other TRON wallets"
// }
```

#### Get Child Recovery Info
```typescript
const recoveryInfo = hdTron.getChildRecoveryInfo(34);
// Returns:
// {
//   masterMnemonic: "marriage space fade...",
//   derivationPath: "m/44'/195'/0'/0/34",
//   address: "TLsEd7jJ5MhK6YRPYEY4rb4NZEePWKfQJL",
//   warning: "⚠️ SECURITY WARNING: This is the MASTER mnemonic..."
// }
```

#### Generate New Mnemonic
```typescript
// 24 words (most secure)
const newMnemonic = TronHDWallet.generateNewMnemonic();

// 12 words (shorter)
const newMnemonic12 = TronHDWallet.generateNewMnemonic12();
```

## Usage in Services

### Web3 Service
**File:** `src/modules/web3/web3.service.ts`

```typescript
// Now passes user ID as childIndex
await this.hdTRX.sweepTRON(
  childWallet3,
  masterWalletTron.address,
  "https://api.trongrid.io",
  "TRX",
  req.user.id, // ← childIndex parameter
);
```

### Disposable Wallet Service
**File:** `src/modules/web3/services/disposable-wallet.service.ts`

```typescript
// TRX sweep
await this.hdTron.sweepTRON(
  childWallet, 
  masterWallet.address, 
  "https://api.trongrid.io",
  "TRX",
  index // ← childIndex parameter
);

// TRC20 sweep
await this.hdTron.sweepTRC20(
  childWallet, 
  masterWallet, 
  "https://api.trongrid.io", 
  tokenAddress, 
  wallet.token_symbol,
  index // ← childIndex parameter
);
```

## Console Output Examples

### Before Sweep:
```
Sweeping TRON wallet: {
  address: 'TLsEd7jJ5MhK6YRPYEY4rb4NZEePWKfQJL',
  path: "m/44'/195'/0'/0/34",
}
```

### After Sweep:
```
✅ TRX Sweep Success: {
  txHash: '3f5e8d2c1a9b7f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0',
  from: 'TLsEd7jJ5MhK6YRPYEY4rb4NZEePWKfQJL',
  to: 'TLKtezKsvMT2Koez8LXGhgVmBvX9pAJSxK',
  amount: '98.500000 TRX',
  fee: '1.500000 TRX'
}
```

## Security Considerations

⚠️ **IMPORTANT SECURITY NOTES:**

1. **Master Mnemonic**
   - Controls ALL derived wallets
   - Must be kept in `.env` file only
   - Never expose in API responses
   - Never log in production

2. **Private Keys**
   - Are logged only in development for debugging
   - Should be commented out in production
   - Only expose to authorized admin users

3. **Child Wallets**
   - Cannot be recovered from private key alone
   - Need master mnemonic + derivation path for recovery
   - Users should import private key into TronLink for convenience

## HD Wallet Derivation Path

TRON uses BIP44 standard with coin type 195:
```
m/44'/195'/0'/0/index
│  │   │    │  │  │
│  │   │    │  │  └── Address index (user ID)
│  │   │    │  └──── Change (0 = receiving)
│  │   │    └─────── Account (0)
│  │   └──────────── Coin type (195 = TRON)
│  └──────────────── Purpose (44 = BIP44)
└─────────────────── Master key
```

## Use Cases

1. **Auditing** - Track which wallet address belongs to which user
2. **Recovery** - Help users recover wallets using private key
3. **Export** - Allow users to export to TronLink wallet
4. **Debugging** - Identify wallet derivation issues
5. **Reporting** - Generate detailed sweep reports

## Next Steps

Consider adding similar wallet details to:
- ETH/EVM sweeps (`hd-wallet.ts`)
- Solana sweeps (`sol-hd-wallet.ts`)
- Bitcoin sweeps (`btc-hd-wallet.ts`)
- Cardano sweeps (`ada-hd-wallet.ts`)
- XRP sweeps (`xrp-hd-wallet.ts`)
- Dogecoin sweeps (`doge-hd-wallet.ts`)
