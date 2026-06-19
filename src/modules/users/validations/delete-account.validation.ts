import * as Joi from "joi";

export const DeleteAccountValidation = Joi.object({
  password: Joi.string()
    .required()
    .min(6)
    .messages({
      "string.empty": "Password is required",
      "string.min": "Password must be at least 6 characters",
      "any.required": "Password is required",
    }),
  
  reason: Joi.string()
    .optional()
    .max(500)
    .messages({
      "string.max": "Reason must not exceed 500 characters",
    }),
});

export const ConfirmDeleteAccountValidation = Joi.object({
  confirmation: Joi.number()
    .valid(1)
    .required()
    .messages({
      "any.only": "Confirmation must be 1 to proceed with account deletion",
      "number.base": "Confirmation must be a number",
      "any.required": "Confirmation is required",
    }),
});
