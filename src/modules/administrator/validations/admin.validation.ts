import { CurrencyCoin } from "@/modules/exchange-rates/exchange-rates.entity";
import * as Joi from "joi";

export const CreateUpdateExchangeRateValidation = Joi.object().keys({
  rate: Joi.number().required(),
  currency: Joi.string()
    .valid(...Object.values(CurrencyCoin))
    .required(),
});

export const BroadcastNotificationValidation = Joi.object().keys({
  message: Joi.string().trim().min(1).max(500).required().label("Message"),
});

export const UpdateUserStatusValidation = Joi.object().keys({
  status: Joi.string().valid("active", "deactivated").required().label("Status"),
});
