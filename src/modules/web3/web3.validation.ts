import * as Joi from "joi";

export const CreateWalletValidation = Joi.object({
  id: Joi.string(),
});

export const WithdrawEthValidation = Joi.object({
  amount: Joi.number().required(),
});

export const WithdrawTokenValidation = Joi.object({
  token: Joi.string().required(),
  amount: Joi.number().required(),
});

export const TokenBalanceValidation = Joi.object({
  token: Joi.string().required(),
});
