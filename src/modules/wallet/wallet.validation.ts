import * as Joi from "joi";

export const CreateWalletValidation = Joi.object().keys({
  user_id: Joi.string().required(),
  network: Joi.string().required(),
  currency: Joi.string().required(),
  wallet_address: Joi.string().required(),
});
