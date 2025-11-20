import * as Joi from "joi";
import { PurchaseType } from "../entities/purchases.entity";

// eslint-disable-next-line @typescript-eslint/no-explicit-any

export const CreatePurchaseValidation = Joi.object().keys({
  type: Joi.required().valid(...Object.keys(PurchaseType)),
  purchase_items: Joi.array().required(),
  endorsers: Joi.array().max(50).optional().allow(null),
  cc: Joi.array().max(50).optional().allow(null),
  approvers: Joi.array().max(50).required(),
  amount: Joi.number().required(),
});

export const CreateAirtimePurchaseValidation = Joi.object().keys({
  network: Joi.string().required(),
  phone_number: Joi.number().required().min(11),
  amount: Joi.number().max(50000).min(50),
  recipient_name: Joi.string().optional().allow(null),
});

export const CreateDataPurchaseValidation = Joi.object().keys({
  network: Joi.string().required(),
  phone_number: Joi.number().required().min(11).label("Phone number"),
  variation_code: Joi.string().required().label("Data plan"),
  amount: Joi.number().min(50),
  recipient_name: Joi.string().optional().allow(null).label("Recipient name"),
  product_name: Joi.string().optional().allow(null).label("Product name"),
});

export const ValidateMeterNumber = Joi.object().keys({
  meter_no: Joi.string().required().label("Meter number"),
  serviceID: Joi.string().required(),
  meter_type: Joi.string().required().label("Meter type"),
});

export const CreateElectricityPurchaseValidation = Joi.object().keys({
  meter_no: Joi.string().required().label("Meter number"),
  meter_type: Joi.string().required().label("Meter type"),
  serviceID: Joi.string().required().label("Distribution company"),
  amount: Joi.number().max(50000).min(50),
  recipient_name: Joi.string().optional().allow(null).label("Recipient name"),
  phone_number: Joi.string().label("Phone number"),
});
