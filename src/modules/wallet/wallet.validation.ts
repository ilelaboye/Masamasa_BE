import Joi from "joi";

export const CreateWalletValidation = Joi.object().keys({
  user: Joi.number().required(),
  network: Joi.string().required(),
  currency: Joi.string().required(),
  wallet_address: Joi.string().required(),
});
