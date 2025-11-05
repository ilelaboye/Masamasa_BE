import * as Joi from "joi";

export const CreateAccountValidation = Joi.object().keys({
  first_name: Joi.string().required().label("First name"),
  last_name: Joi.string().required().label("Last name"),
  email: Joi.string().email().required().label("Email"),
  phone: Joi.string().max(50).required().label("Phone"),
  country: Joi.string().required().label("Country"),
  password: Joi.string().min(6).max(50).required().messages({
    "string.pattern.base":
      "password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character.",
  }),
  password_confirmation: Joi.string()
    .required()
    .valid(Joi.ref("password"))
    .messages({
      "any.only": "password does not match",
    })
    .label("Confirm password"),
});

export const ChangeUserPasswordValidation = Joi.object().keys({
  old_password: Joi.string().required().label("Old password"),
  new_password: Joi.string().min(6).max(50).required().messages({
    "string.pattern.base":
      "password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character.",
  }),
  new_password_confirmation: Joi.string()
    .required()
    .valid(Joi.ref("new_password"))
    .messages({
      "any.only": "new password does not match",
    })
    .label("Confirm password"),
});

export const EditUserValidation = Joi.object().keys({
  first_name: Joi.string().optional().allow(null),
  last_name: Joi.string().optional().allow(null),
  address: Joi.string().optional().allow(null),
  phone: Joi.string().optional().allow(null),
});

export const TransferValidation = Joi.object().keys({
  pin: Joi.string().required(),
  email: Joi.string().email().required(),
  amount: Joi.number().required().min(100),
});
