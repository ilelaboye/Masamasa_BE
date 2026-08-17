import {
  WITHDRAWAL_MAX_PER_DAY,
  WITHDRAWAL_MIN_PER_TRANSACTION,
} from "@/constants";
import * as Joi from "joi";

export const LoginValidation = Joi.object().keys({
  email: Joi.string().email().max(50).required(),
  password: Joi.string().optional().allow(null, ""),
  google_id: Joi.string().optional().allow(null, ""),
  device_id: Joi.string().optional().allow(null, ""),
  notification_token: Joi.string().optional().allow(null, ""),
});

export const ResetPasswordValidation = Joi.object().keys({
  email: Joi.string().email().max(50).required(),
  token: Joi.string().required(),
  password: Joi.string().min(6).max(32).required().messages({
    "string.pattern.base":
      "Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character.",
  }),
  password_confirmation: Joi.any()
    .equal(Joi.ref("password"))
    .required()
    .label("Confirm password")
    .messages({ "any.only": "{{#label}} does not match" }),
});

export const ForgotPasswordValidation = Joi.object().keys({
  email: Joi.string().email().max(50).required(),
});

export const ConfirmUserEmailValidation = Joi.object().keys({
  email: Joi.string().required(),
  token: Joi.string().required(),
  type: Joi.string().required(),
});

export const VerifyMfaValidation = Joi.object().keys({
  email: Joi.string().email().required(),
  token: Joi.string().required(),
});

export const WithdrawalValidation = Joi.object().keys({
  accountNumber: Joi.string().max(10).required().label("Account number"),
  bankCode: Joi.string().max(50).required().label("Bank code"),
  accountName: Joi.string().required().label("Account name"),
  bankName: Joi.string().max(50).required().label("Bank name"),
  // Derived from the constant rather than repeated, so this schema cannot
  // drift below the limit users.service actually enforces. Joi runs in the
  // pipe ahead of the service, so a lower number here silently becomes the
  // real limit and the service's own check never gets a chance to run.
  // The daily cap is the widest a single withdrawal can ever be; the service
  // narrows it further per account (KYC status, allowance already used today).
  amount: Joi.number()
    .min(WITHDRAWAL_MIN_PER_TRANSACTION)
    .max(WITHDRAWAL_MAX_PER_DAY)
    .required()
    .label("Amount"),
  pin: Joi.number().required().label("Pin"),
});
