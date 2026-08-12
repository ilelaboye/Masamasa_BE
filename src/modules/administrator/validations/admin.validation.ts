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
  status: Joi.string()
    .valid("active", "deactivated")
    .required()
    .label("Status"),
});

export const ChangeAdminPasswordValidation = Joi.object().keys({
  old_password: Joi.string().required().label("Old password"),
  new_password: Joi.string()
    .min(6)
    .max(32)
    .required()
    .invalid(Joi.ref("old_password"))
    .messages({
      "any.invalid": "New password must be different from the old password",
    })
    .label("New password"),
});

export const UpdateAdminProfileValidation = Joi.object().keys({
  first_name: Joi.string().trim().min(1).max(50).required().label("First name"),
  last_name: Joi.string().trim().min(1).max(50).required().label("Last name"),
  phone: Joi.string().trim().max(50).required().label("Phone"),
  address: Joi.string()
    .trim()
    .max(255)
    .optional()
    .allow(null, "")
    .label("Address"),
});
