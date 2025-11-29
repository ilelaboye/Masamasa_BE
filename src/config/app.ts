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

  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,

  FLW_PUBLIC_KEY: process.env.FLW_PUBLIC_KEY,
  FLW_SECRET_KEY: process.env.FLW_SECRET_KEY,
  CLAN_TOKEN: process.env.CLAN_TOKEN,

  VTPASS_ELECTRICITY_FEE: process.env.VTPASS_ELECTRICITY_FEE || 100,
  VTPASS_API_KEY: process.env.VTPASS_API_KEY,
  VTPASS_PUBLIC_KEY: process.env.VTPASS_PUBLIC_KEY,
  VTPASS_SECRET_KEY: process.env.VTPASS_SECRET_KEY,
  VTPASS_URL: process.env.VTPASS_URL,
  VTPASS_USERNAME: process.env.VTPASS_USERNAME,
  VTPASS_PASSWORD: process.env.VTPASS_PASSWORD,

  PREMBLY_IDENTITY_PASSAPIKEY: process.env.PREMBLY_IDENTITY_PASSAPIKEY,
  PREMBLY_IDENTITY_PASSAPPID: process.env.PREMBLY_IDENTITY_PASSAPPID,

  // IMAGE UPLOAD
  CLOUDINARY_UPLOAD_PRESET: process.env.CLOUDINARY_UPLOAD_PRESET ?? "unsigned_upload",
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ?? "dtvin0cxo",

  // seed phrase for HD wallet
  MASTER_MNEMONIC: "glue bicycle alien lamp practice head undo tool peace price wrestle street",
  SOL_MASTER_MNEMONIC: "trouble test waste exercise airport pepper frown umbrella trip erupt teach win",
  TRX_MASTER_MNEMONIC: "gift apology cloth barely pair memory dial when neither decrease expand unusual",
  ADA_MASTER_MNEMONIC: "wet fat great food armor legal stage blame distance twist fiber style distance yard wheel cliff ladder announce food mandate unfair glide hope struggle",
  EVM_RPC_URL: "https://bsc-dataseed.binance.org/",
  SOL_RPC_URL: "https://api.mainnet-beta.solana.com",
  TRX_API_KEY: "d12ff04b-0531-4af7-8135-42ea27952387",
  ETH_PRIVATE_KEY: process.env.PRIVATE_KEY ?? "5198857d08edc8e8d2708b34b659511f6a5f51587b66c43e424a97a3bb978796",

};
