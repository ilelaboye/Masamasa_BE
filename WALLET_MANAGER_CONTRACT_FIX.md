# WalletManager Contract Fix

## Issue Fixed
Error: `invalid value for Contract target (argument="target", value=null, code=INVALID_ARGUMENT, version=6.15.0)`

## Root Cause
The `/web3/recent-transactions` endpoint was trying to create an ethers.js Contract with a hardcoded string `"appConfig"` instead of an actual contract address:

```typescript
// ❌ WRONG - Before
const walletManager = this.getContract("appConfig", signer);
```

## Solution Applied

### 1. Disabled Endpoint with Clear Error Message
The endpoint now returns a helpful error message:

```typescript
// src/modules/web3/web3.controller.ts
@Get("/recent-transactions")
async getRecentTransactions() {
  throw new BadRequestException(
    "Recent transactions feature requires a deployed WalletManager contract. " +
    "Please configure WALLET_MANAGER_CONTRACT_ADDRESS in your .env file."
  );
}
```

### 2. Fixed Service Method
Updated to use proper config:

```typescript
// src/modules/web3/web3.service.ts
async getRecentTransactions() {
  // Check if contract address is configured
  if (!appConfig.WALLET_MANAGER_CONTRACT_ADDRESS) {
    throw new Error("WALLET_MANAGER_CONTRACT_ADDRESS not configured");
  }

  const walletManager = this.getContract(
    appConfig.WALLET_MANAGER_CONTRACT_ADDRESS, // ✅ Proper address
    signer
  );
  // ... rest of code
}
```

### 3. Added Config Option
Added to `src/config/app.ts`:

```typescript
export const appConfig = {
  // ... other config
  
  // Smart Contract Addresses (optional)
  WALLET_MANAGER_CONTRACT_ADDRESS: process.env.WALLET_MANAGER_CONTRACT_ADDRESS,
};
```

## How to Enable This Feature (Future)

If you want to use the `/web3/recent-transactions` endpoint, you need to:

### Step 1: Deploy WalletManager Contract
Deploy the smart contract with this ABI:

```solidity
interface IWalletManager {
  function getAllTransactions() 
    external 
    view 
    returns (
      tuple(
        string network,
        address wallet,
        uint256 amount,
        string tokenSymbol,
        address tokenAddress,
        uint256 timestamp
      )[]
    );
}
```

### Step 2: Add Contract Address to .env
Add the deployed contract address to your `.env` file:

```bash
# WalletManager Smart Contract (optional)
WALLET_MANAGER_CONTRACT_ADDRESS="0xYourContractAddressHere"
```

### Step 3: Uncomment Controller Method
In `src/modules/web3/web3.controller.ts`, uncomment the actual implementation:

```typescript
@Get("/recent-transactions")
async getRecentTransactions() {
  // Remove the error throw and uncomment:
  return await this.web3Service.getRecentTransactions();
}
```

## Current Status
✅ **Fixed** - Endpoint won't crash with null contract error
⚠️ **Disabled** - Feature requires contract deployment to work
📝 **Documented** - Clear instructions for future enablement

## Alternative Solution
If you don't need smart contract-based transaction tracking, you can:

1. Use the existing database transaction tracking
2. Query from `transactions` table directly
3. Create a new endpoint that doesn't require a smart contract:

```typescript
@Get("/transactions/recent")
async getRecentDatabaseTransactions(@Req() req: UserRequest) {
  return await this.transactionService.findRecent(req.user.id, 10);
}
```

## Files Modified
1. **src/modules/web3/web3.controller.ts** - Disabled endpoint with error message
2. **src/modules/web3/web3.service.ts** - Fixed contract address usage
3. **src/config/app.ts** - Added WALLET_MANAGER_CONTRACT_ADDRESS config
4. **WALLET_MANAGER_CONTRACT_FIX.md** - This documentation

## Testing
After these changes, calling `/web3/recent-transactions` will return:
```json
{
  "success": false,
  "message": "Recent transactions feature requires a deployed WalletManager contract. Please configure WALLET_MANAGER_CONTRACT_ADDRESS in your .env file.",
  "error": "Bad Request",
  "statusCode": 400
}
```

This is expected and correct behavior until you deploy and configure the contract.
