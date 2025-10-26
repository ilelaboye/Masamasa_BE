import "dotenv/config";

export const dbConfig = {
  DB_HOST: process.env.DB_HOST || "localhost",
  DB_PORT: process.env.DB_PORT || "3306",
  DB_USERNAME: process.env.DB_USERNAME,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_NAME: process.env.DB_NAME,
};

export const appConfig = {
  APP_NAME: process.env.APP_NAME ? process.env.APP_NAME : "",
  APP_FRONTEND: process.env.APP_FRONTEND ? process.env.APP_FRONTEND : "",
  APP_URL: process.env.APP_URL ? process.env.APP_URL : "",
  WEB_FRONTEND: process.env.WEB_FRONTEND,
  PORT: process.env.PORT || 4000,
  DEBUG: process.env.DEBUG,
  ENV: process.env.ENV || "dev",
  TZ: process.env.TZ || "Africa/Lagos",

  BCRYPT_SALT: process.env.BCRYPT_SALT,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  JWT_SECRET: process.env.JWT_SECRET,
  COOKIE_SECRET: process.env.COOKIE_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
  FILE_UPLOAD_PATH: process.env.FILE_UPLOAD_PATH,

  MAILJET_FROM: process.env.MAILJET_FROM || "",
  MAILJET_FROM_NAME: process.env.MAILJET_FROM_NAME || "",
  MAILJET_APIKEY_PUBLIC: process.env.MAILJET_APIKEY_PUBLIC || "",
  MAILJET_APIKEY_PRIVATE: process.env.MAILJET_APIKEY_PRIVATE || "",

  CLOUDINARYNAME: process.env.CLOUDINARYNAME,
  CLOUDINARYAPIKEY: process.env.CLOUDINARYAPIKEY,
  CLOUDINARYAPISECRET: process.env.CLOUDINARYAPISECRET,

  SWAGGER_PASSWORD: process.env.SWAGGER_PASSWORD
    ? process.env.SWAGGER_PASSWORD
    : "secret",

  REDIS_HOST: process.env.REDIS_HOST,
  REDIS_PORT: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_URL: process.env.REDIS_URL,
  OTP_TIMEOUT: 15,
};
