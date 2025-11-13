import * as Joi from "joi";

export const ActionOnStaffInviteValidation = Joi.object().keys({
  action: Joi.string().required(),
  token: Joi.string().required(),
  companyId: Joi.string().required(),
  password: Joi.string().min(6).max(50).optional().allow(null).messages({
    "string.pattern.base":
      "Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character.",
  }),
  password_confirmation: Joi.string()
    .max(50)
    .when("password", {
      is: Joi.exist(),
      then: Joi.required()
        .valid(Joi.ref("password"))
        .messages({ "any.only": "Password does not match" }),
      otherwise: Joi.forbidden(),
    }),
});

export const BankAccountVerificationValidation = Joi.object().keys({
  accountNumber: Joi.string().max(50).required().label("Account number"),
  bankName: Joi.string().max(50).required().label("Bank name"),
  bankCode: Joi.string().max(50).required().label("Bank code"),
});
