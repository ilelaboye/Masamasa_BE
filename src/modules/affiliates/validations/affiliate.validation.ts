import * as Joi from "joi";

export const CreateAffiliateValidation = Joi.object().keys({
  user_ids: Joi.array()
    .items(Joi.number().integer().positive().required())
    .min(1)
    .max(50)
    .unique()
    .required()
    .label("User ids"),
});
