import * as Joi from 'joi';

export const BankAccountVerificationValidation = Joi.object().keys({
  accountNumber: Joi.string().max(50).required().label('Account number'),
  bankName: Joi.string().max(50).required().label('Bank name'),
  bankCode: Joi.string().max(50).required().label('Bank code'),
});
