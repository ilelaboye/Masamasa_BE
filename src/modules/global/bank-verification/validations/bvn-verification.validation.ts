import * as Joi from "joi";

export const BVNVerificationValidation = Joi.object().keys({
  bvn: Joi.string().max(11).required(),
  gender: Joi.string().max(50).required(),
  dob: Joi.date().required().label("Date of birth"),
});
