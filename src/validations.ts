import * as Joi from "joi";

export const ConfigModuleSchema = Joi.object({
  APP_NAME: Joi.string().required(),
  APP_FRONTEND: Joi.string().required(),
  WEB_FRONTEND: Joi.string().required(),
  APP_URL: Joi.string().required(),
  PORT: Joi.number().default(8000),
  DEBUG: Joi.boolean().default(true),
  DB_HOST: Joi.string().default("localhost"),
  DB_PORT: Joi.string().default("5432"),
  DB_USERNAME: Joi.string(),
  DB_PASSWORD: Joi.string(),
  DB_NAME: Joi.string(),
  ENV: Joi.string()
    .valid("dev", "production", "test", "staging")
    .default("dev"),
  BCRYPT_SALT: Joi.number().required(),
  JWT_SECRET: Joi.string().required(),
  COOKIE_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().required(),
  FILE_UPLOAD_PATH: Joi.string().required(),
  MAILJET_FROM: Joi.string().required(),
  MAILJET_FROM_NAME: Joi.string().required(),
  MAILJET_APIKEY_PUBLIC: Joi.string().required(),
  MAILJET_APIKEY_PRIVATE: Joi.string().required(),
  CLOUDINARYNAME: Joi.string().required(),
  CLOUDINARYAPIKEY: Joi.string().required(),
  CLOUDINARYAPISECRET: Joi.string().required(),
  SWAGGER_PASSWORD: Joi.string().required(),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.string().allow(null, ""),
  REDIS_PASSWORD: Joi.string().allow(null, ""),
});
