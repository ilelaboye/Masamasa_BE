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
  confirmationCode: Joi.string()
    .required()
    .length(6)
    .pattern(/^[0-9]+$/)
    .messages({
      "string.empty": "Confirmation code is required",
      "string.length": "Confirmation code must be 6 digits",
      "string.pattern.base": "Confirmation code must contain only numbers",
      "any.required": "Confirmation code is required",
    }),
});
