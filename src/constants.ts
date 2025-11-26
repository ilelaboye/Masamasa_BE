import type { CookieOptions as CookieOptionsType } from "express";

export const _IS_PROD_ = process.env.ENV === "production",
  _AUTH_COOKIE_NAME_ = "__8139a745d54__",
  _ADMIN_AUTH_COOKIE_NAME_ = "__18p36s745d09__",
  _TTL_ = 1000 * 60 * 60 * 24 * 7,
  _THROTTLE_TTL_ = 60 * 5; //5mins

export const CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
  maxAge: _TTL_,
} satisfies CookieOptionsType;

export const MAILJETTemplates = {
  verify_email: 7451545,
};

export const ZohoMailTemplates = {
  verify_email:
    "2d6f.7b2fb6a80c080b10.k1.d608a9c0-c856-11f0-87e5-aeb2e8ed505e.19ab03ff65c",
};
