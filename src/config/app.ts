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

  ZOHO_MAIL_CLIENT_ID: process.env.ZOHO_MAIL_CLIENT_ID,
  ZOHO_MAIL_AGENT_ID: process.env.ZOHO_MAIL_AGENT_ID,
  ZOHO_FROM: process.env.ZOHO_FROM || "",
  ZOHO_FROM_NAME: process.env.ZOHO_FROM_NAME || "",

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
  CLOUDINARY_UPLOAD_PRESET: process.env.CLOUDINARY_UPLOAD_PRESET,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,

  // seed phrase for HD wallet
  MASTER_MNEMONIC: process.env.MASTER_MNEMONIC ?? "",
  SOL_MASTER_MNEMONIC: process.env.SOL_MASTER_MNEMONIC ?? "",
  TRX_MASTER_MNEMONIC: process.env.TRX_MASTER_MNEMONIC ?? "",
  ADA_MASTER_MNEMONIC: process.env.ADA_MASTER_MNEMONIC ?? "",
  BTC_MASTER_MNEMONIC: process.env.MASTER_MNEMONIC ?? "",
  EVM_RPC_URL: "https://bsc-dataseed1.defibit.io",
  BASE_RPC_URL: "https://base-mainnet.public.blastapi.io",
  ETH_RPC_URL: "https://eth.meowrpc.com",
  SOL_RPC_URL: "https://api.mainnet-beta.solana.com",
  XRP_RPC_URL: "wss://xrplcluster.com",
  // XRP_RPC_URL: "wss://s.altnet.rippletest.net:51233",
  TRX_API_KEY: process.env.TRX_API_KEY ?? "",
  ETH_PRIVATE_KEY: process.env.PRIVATE_KEY ?? "",
  //BLOCK
  BLOCK_API_KEY: process.env.BLOCK_API_KEY,

  NOMBA_CLIENT_ID: process.env.NOMBA_CLIENT_ID || "",
  NOMBA_PRIVATE_KEY: process.env.NOMBA_PRIVATE_KEY || "",
  NOMBA_ACCOUNT_ID: process.env.NOMBA_ACCOUNT_ID || "",
  NOMBA_BASE_URL: process.env.NOMBA_BASE_URL || "https://api.nomba.com",
  NOMBA_WEBHOOK_SECRET: process.env.NOMBA_WEBHOOK_SECRET || "",
};
