import * as Joi from "joi";

export const CreateWalletValidation = Joi.object({
  id: Joi.string(),
});

export const WithdrawEthValidation = Joi.object({
  amount: Joi.number().required(),
});

export const WithdrawTokenValidation = Joi.object({
  amount: Joi.number().required(),
  to: Joi.number().required(),
  network: Joi.string().required(),
  symbol: Joi.string().required()
});

export const TokenBalanceValidation = Joi.object({
  token: Joi.string().required(),
});
