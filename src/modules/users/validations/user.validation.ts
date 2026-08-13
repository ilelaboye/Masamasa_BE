import * as Joi from "joi";

export const CreateAccountValidation = Joi.object().keys({
  first_name: Joi.string().required().label("First name"),
  last_name: Joi.string().required().label("Last name"),
  email: Joi.string().email().required().label("Email"),
  google_id: Joi.string().optional().allow(null, ""),
  // Compulsory at registration. `.allow(null, "")` is deliberately absent —
  // with it, required() would still let an empty string through.
  phone: Joi.string().max(15).required().label("Phone"),
  country: Joi.string().required().label("Country"),
  device_id: Joi.string().optional().allow(null, ""),
  notification_token: Joi.string().optional().allow(null, ""),
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
  // Present only on the final change call; the OTP-request step omits it.
  otp: Joi.string().optional().allow(null, "").label("Verification code"),
});

export const UpdateAccountValidation = Joi.object().keys({
  first_name: Joi.string().required().label("First name"),
  last_name: Joi.string().required().label("Last name"),
  email: Joi.optional().allow(null).label("Email"),
  phone: Joi.string().max(50).required().label("Phone"),
  country: Joi.string().optional().allow(null).label("Country"),
  address: Joi.string().optional().allow(null).label("Address"),
  city: Joi.string().optional().allow(null).label("City"),
  state: Joi.string().optional().allow(null).label("State"),
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

// Step 2 of the change-password flow resends the same details plus the code
// that was emailed in step 1. Extended from the base schema so the password
// rules stay in one place — and declared at all because Joi rejects keys it
// does not know about, so an undeclared `otp` never reaches the service.
export const VerifyPasswordChangeValidation = ChangeUserPasswordValidation.keys(
  {
    otp: Joi.string().required().label("Verification code"),
  },
);

export const EditUserValidation = Joi.object().keys({
  first_name: Joi.string().optional().allow(null),
  last_name: Joi.string().optional().allow(null),
  address: Joi.string().optional().allow(null),
  phone: Joi.string().optional().allow(null),
});

export const UploadImageValidation = Joi.object().keys({
  type: Joi.string().required(),
  image: Joi.string().required().uri(),
});

export const TransferValidation = Joi.object().keys({
  pin: Joi.string().required(),
  email: Joi.string().email().required(),
  amount: Joi.number().required().min(100),
});
