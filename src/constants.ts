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

/**
 * Options for clearing an auth cookie.
 *
 * A browser only removes a cookie when the deleting Set-Cookie carries the
 * same attributes it was set with, excluding expires/maxAge. Calling
 * res.clearCookie(name) bare omits SameSite=None and Secure, and since the
 * admin panel and the API are different origins that write is cross-site —
 * so the browser drops it and the session survives.
 */
export const ClearCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
} satisfies CookieOptionsType;

// Flat fee (in USD) charged on every crypto deposit except the exempt coins.
export const DEPOSIT_FEE_USD = 1;
export const DEPOSIT_FEE_EXEMPT_CURRENCIES = new Set(["usdt"]);

// Withdrawal ceiling for verified (KYC-approved) accounts, in NGN. There is no
// separate per-transaction cap — a single withdrawal may be as large as the
// day's remaining allowance.
// The day is a calendar day in the app timezone (Africa/Lagos).
export const WITHDRAWAL_MAX_PER_DAY = 5000000;

// Smallest withdrawal accepted, for any account.
export const WITHDRAWAL_MIN_PER_TRANSACTION = 1000;

// Accounts that have not completed KYC can still withdraw, but only up to
// this ceiling. It caps both a single transaction and the running day total —
// capping only the transaction would be no cap at all, since the same amount
// could simply be withdrawn again.
export const WITHDRAWAL_MAX_UNVERIFIED = 50000;

export const MAILJETTemplates = {
  verify_email: 7451545,
};

export const ZohoMailTemplates = {
  verify_email:
    "2d6f.7b2fb6a80c080b10.k1.d608a9c0-c856-11f0-87e5-aeb2e8ed505e.19ab03ff65c",
  forgot_password:
    "2d6f.7b2fb6a80c080b10.k1.83153ca0-d473-11f0-9139-fae9afc80e45.19affa08d6a",
  coins_deposit_confirmed:
    "2d6f.7b2fb6a80c080b10.k1.c1f29b71-85d0-11f1-93af-5254005934b4.19f8a005ea7",
  withdrawal_successful:
    "2d6f.7b2fb6a80c080b10.k1.b31daa61-9b54-11f1-b381-525400a229b1.1a017013805",
};
