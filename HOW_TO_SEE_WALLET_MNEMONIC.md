# How to See Wallet Key Phrase (Mnemonic)

## Important Concept ⚠️

**HD Wallets don't have individual mnemonics for each wallet!**

All child wallets (user wallets) are derived from ONE master mnemonic:
```
Master Mnemonic → Child Wallet 1, Child Wallet 2, Child Wallet 3...
```

## Where to Find the Master Mnemonic

### 1. **Environment Variables** (Primary Source)
Check your `.env` file:

```bash
TRX_MASTER_MNEMONIC="marriage space fade require because rival wide flash moral rib drip little"
```

This is the **master seed phrase** that controls ALL TRON wallets in your system.

### 2. **From Sweep Operations** (Now Included)
When you run a sweep, it will now log and return the mnemonic:

**Console Output:**
```
Sweeping TRON wallet: {
  address: 'TLsEd7jJ5MhK6YRPYEY4rb4NZEePWKfQJL',
  path: "m/44'/195'/0'/0/34",
  masterMnemonic: 'marriage space fade require because rival wide flash moral rib drip little'
}
```

**API Return Value:**
```json
{
  "success": true,
  "txHash": "abc123...",
  "walletDetails": {
    "address": "TLsEd7jJ5MhK6YRPYEY4rb4NZEePWKfQJL",
    "privateKey": "5a1b2c3d...",
    "derivationPath": "m/44'/195'/0'/0/34",
    "masterMnemonic": "marriage space fade require because rival wide flash moral rib drip little",
    "howToRecover": "Import this into TronLink..."
  }
}
```

### 3. **Using Code Directly**

```typescript
// In your service
const hdTron = new TronHDWallet(mnemonic, rpcUrl, publicService);

// Get the master mnemonic
const masterMnemonic = hdTron.getMasterMnemonic();
console.log("Master Mnemonic:", masterMnemonic);

// Get full recovery info for a specific user
const recoveryInfo = hdTron.getChildRecoveryInfo(34);
console.log(recoveryInfo);
// Returns:
// {
//   masterMnemonic: "marriage space fade...",
//   derivationPath: "m/44'/195'/0'/0/34",
//   address: "TLsEd7jJ5MhK6YRPYEY4rb4NZEePWKfQJL",
//   warning: "⚠️ SECURITY WARNING..."
// }
```

## How to Recover a Specific User's Wallet

### Option 1: Using Master Mnemonic + Derivation Path

**Step 1:** Get the master mnemonic from `.env`:
```
marriage space fade require because rival wide flash moral rib drip little
```

**Step 2:** Get the user's derivation path:
```
m/44'/195'/0'/0/34  (where 34 is the user ID)
```

**Step 3:** Import into TronLink or any TRON wallet:
1. Open TronLink
2. Select "Import Wallet"
3. Choose "Import with Mnemonic"
4. Enter the master mnemonic
5. Go to advanced settings
6. Set derivation path to: `m/44'/195'/0'/0/34`

### Option 2: Using Private Key (Easier)

Each wallet also has a private key that can be directly imported:

```typescript
const child = hdTron.deriveChild(34);
console.log("Private Key:", child.privateKey);
// Use this private key to import directly into TronLink
```

**Step 1:** Get the private key from sweep operation or code
**Step 2:** Import into TronLink:
1. Open TronLink
2. Select "Import Wallet"
3. Choose "Import with Private Key"
4. Paste the private key

## All Master Mnemonics in Your System

From your `.env` file:

```bash
# EVM Chains (ETH, BSC, BASE, Polygon)
MASTER_MNEMONIC="amazing satoshi kid local aware coconut wood book oyster miss system either"

# Solana
SOL_MASTER_MNEMONIC="cable goose culture child civil region sibling mango eternal fury mammal barrel"

# TRON
TRX_MASTER_MNEMONIC="marriage space fade require because rival wide flash moral rib drip little"

# Cardano
ADA_MASTER_MNEMONIC="corn ancient deputy muffin wrist fringe zone deer trap claim alpha rule sentence road hero cry weekend panther under atom delay merry hint gadget"

# Dogecoin (uses same as EVM)
MASTER_MNEMONIC="amazing satoshi kid local aware coconut wood book oyster miss system either"
```

## Security Best Practices ⚠️

### DO ✅
- Keep master mnemonics in `.env` only
- Use environment variables in production
- Back up mnemonics in secure offline storage
- Give users their private keys for easy import
- Log mnemonics only in development

### DON'T ❌
- Never expose master mnemonic in API responses to clients
- Never commit mnemonics to Git
- Never share master mnemonic with users
- Never store mnemonics in database
- Never log mnemonics in production

## Create New Master Mnemonic

If you need to generate a new master mnemonic:

```typescript
// 24 words (most secure)
const newMnemonic = TronHDWallet.generateNewMnemonic();
console.log(newMnemonic);

// 12 words (shorter, still secure)
const newMnemonic12 = TronHDWallet.generateNewMnemonic12();
console.log(newMnemonic12);
```

## API Endpoint to Get Wallet Details

You can create an admin-only endpoint to retrieve wallet details:

```typescript
// In your controller (ADMIN ONLY!)
@Get("/admin/wallet-details/:userId")
@UseGuards(AdminAuthGuard)
async getWalletDetails(@Param("userId") userId: number) {
  const recoveryInfo = this.hdTron.getChildRecoveryInfo(userId);
  return recoveryInfo;
}
```

**Response:**
```json
{
  "masterMnemonic": "marriage space fade...",
  "derivationPath": "m/44'/195'/0'/0/34",
  "address": "TLsEd7jJ5MhK6YRPYEY4rb4NZEePWKfQJL",
  "warning": "⚠️ SECURITY WARNING: This is the MASTER mnemonic..."
}
```

## Understanding HD Wallets

```
Master Seed (Mnemonic)
    ↓
m/44'/195'/0'/0/0  → User 1's Wallet
m/44'/195'/0'/0/1  → User 2's Wallet
m/44'/195'/0'/0/2  → User 3's Wallet
m/44'/195'/0'/0/34 → User 34's Wallet
```

**Key Points:**
- ONE master mnemonic controls EVERYTHING
- Each user has a different derivation path (index)
- You can recover any child wallet with: master mnemonic + path
- Private key is derived from master mnemonic + path
- Cannot reverse-engineer master mnemonic from child wallet

## Quick Reference

| What You Need | Where to Find It |
|---------------|------------------|
| Master Mnemonic | `.env` file → `TRX_MASTER_MNEMONIC` |
| User's Address | Database or derive from index |
| User's Private Key | `hdTron.deriveChild(userId).privateKey` |
| Derivation Path | `m/44'/195'/0'/0/{userId}` |
| Full Recovery Info | `hdTron.getChildRecoveryInfo(userId)` |

## Current Master Mnemonic

**TRON Master Mnemonic:**
```
marriage space fade require because rival wide flash moral rib drip little
```

This mnemonic is now included in all sweep operations and can be accessed through the methods provided above.
