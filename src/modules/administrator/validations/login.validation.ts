import * as Joi from 'joi';

export const LoginValidation = Joi.object().keys({
  email: Joi.string().email().max(50).required(),
  password: Joi.string().min(1).max(32).required(),
});
