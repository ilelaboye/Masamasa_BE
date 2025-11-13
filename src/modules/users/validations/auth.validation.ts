import * as Joi from "joi";

export const LoginValidation = Joi.object().keys({
  email: Joi.string().email().max(50).required(),
  password: Joi.string().min(6).max(32).required(),
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

export const WithdrawalValidation = Joi.object().keys({
  accountNumber: Joi.string().max(10).required().label("Account number"),
  bankCode: Joi.string().max(50).required().label("Bank code"),
  accountName: Joi.string().max(10).required().label("Account name"),
  bankName: Joi.string().max(50).required().label("Bank name"),
  amount: Joi.number().max(100000).required().label("Amount"),
  pin: Joi.number().required().label("Pin"),
});
