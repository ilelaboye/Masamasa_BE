import { CurrencyCoin } from "@/modules/exchange-rates/exchange-rates.entity";
import * as Joi from "joi";

export const CreateUpdateExchangeRateValidation = Joi.object().keys({
  rate: Joi.number().required(),
  currency: Joi.string()
    .valid(...Object.values(CurrencyCoin))
    .required(),
});
