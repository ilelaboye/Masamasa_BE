import * as Joi from "joi";

export const CreateWalletValidation = Joi.object({
  id: Joi.string(),
});

export const WithdrawEthValidation = Joi.object({
  amount: Joi.number().required(),
});

export const WithdrawTokenValidation = Joi.object({
  amount: Joi.number().required(),
  to: Joi.string().required(),
  network: Joi.string().required(),
  symbol: Joi.string().required(),
  destinationTag:Joi.string(),
});

export const TokenBalanceValidation = Joi.object({
  token: Joi.string().required(),
});

// ====================================
// DISPOSABLE WALLET VALIDATIONS
// ====================================

export const CreateDisposableWalletValidation = Joi.object({
  network: Joi.string()
    .valid("BASE", "ETH", "ETHEREUM", "BSC", "BNB", "BINANCE", "POLYGON", "MATIC", "SOLANA", "SOL", "TRON", "TRX", "BITCOIN", "BTC", "CARDANO", "ADA", "RIPPLE", "XRP", "DOGE", "DOGECOIN")
    .required()
    .messages({
      "any.only": "Network must be one of: BASE, ETH, BSC, POLYGON, SOLANA, TRON, BITCOIN, CARDANO, RIPPLE, DOGE",
      "any.required": "Network is required",
    }),
  
  expectedAmount: Joi.number()
    .positive()
    .optional()
    .messages({
      "number.positive": "Expected amount must be positive",
    }),
  
  tokenSymbol: Joi.string()
    .uppercase()
    .optional()
    .messages({
      "string.uppercase": "Token symbol must be uppercase",
    }),
  
  expirationMinutes: Joi.number()
    .integer()
    .min(5)
    .max(10080) // 7 days max
    .optional()
    .default(60)
    .messages({
      "number.min": "Expiration must be at least 5 minutes",
      "number.max": "Expiration cannot exceed 7 days (10080 minutes)",
    }),
  
  metadata: Joi.object()
    .optional(),
});

export const CheckDisposableWalletValidation = Joi.object({
  address: Joi.string()
    .required()
    .messages({
      "any.required": "Address is required",
    }),
  
  network: Joi.string()
    .valid("BASE", "ETH", "ETHEREUM", "BSC", "BNB", "BINANCE", "POLYGON", "MATIC", "SOLANA", "SOL", "TRON", "TRX", "BITCOIN", "BTC", "CARDANO", "ADA", "RIPPLE", "XRP", "DOGE", "DOGECOIN")
    .required()
    .messages({
      "any.only": "Network must be one of: BASE, ETH, BSC, POLYGON, SOLANA, TRON, BITCOIN, CARDANO, RIPPLE, DOGE",
      "any.required": "Network is required",
    }),
  
  destinationTag: Joi.number()
    .integer()
    .optional(),
});

export const SweepDisposableWalletValidation = Joi.object({
  address: Joi.string()
    .required()
    .messages({
      "any.required": "Address is required",
    }),
  
  network: Joi.string()
    .valid("BASE", "ETH", "ETHEREUM", "BSC", "BNB", "BINANCE", "POLYGON", "MATIC", "SOLANA", "SOL", "TRON", "TRX", "BITCOIN", "BTC", "CARDANO", "ADA", "RIPPLE", "XRP", "DOGE", "DOGECOIN")
    .required()
    .messages({
      "any.only": "Network must be one of: BASE, ETH, BSC, POLYGON, SOLANA, TRON, BITCOIN, CARDANO, RIPPLE, DOGE",
      "any.required": "Network is required",
    }),
  
  tokenSymbol: Joi.string()
    .uppercase()
    .optional(),
  
  destinationTag: Joi.number()
    .integer()
    .optional(),
});

export const ListDisposableWalletsValidation = Joi.object({
  status: Joi.string()
    .valid("pending", "funded", "swept", "expired", "failed")
    .optional(),
  
  network: Joi.string()
    .valid("BASE", "ETH", "ETHEREUM", "BSC", "BNB", "BINANCE", "POLYGON", "MATIC", "SOLANA", "SOL", "TRON", "TRX", "BITCOIN", "BTC", "CARDANO", "ADA", "RIPPLE", "XRP", "DOGE", "DOGECOIN")
    .optional(),
  
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .optional()
    .default(50),
  
  offset: Joi.number()
    .integer()
    .min(0)
    .optional()
    .default(0),
});
