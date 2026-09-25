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
export const DEPOSIT_FEE_USD = 2;
export const DEPOSIT_FEE_EXEMPT_CURRENCIES = new Set([
  "usdt",
  "cngn",
  "usdc",
  "busd",
]);

// The daily withdrawal ceiling identity verification (tier 2) raises an account
// to, in NGN. Each account carries its own limit in users.withdrawal_limit.
// There is no separate per-transaction cap: a single withdrawal may be as large
// as the day's remaining allowance.
// The day is a calendar day in the app timezone (Africa/Lagos).
export const WITHDRAWAL_MAX_PER_DAY = 5000000;

// What address verification (tier 3) raises the ceiling to, and therefore the
// highest limit any account may hold: the maximum an admin may set by hand and
// the widest a single withdrawal may be. Both Joi schemas cap at this rather
// than at the tier 2 figure, or a tier 3 account could never spend its ceiling.
export const WITHDRAWAL_MAX_ADDRESS_VERIFIED = 10000000;

// Verification tier reached once identity is verified. Tier 1 is every
// registered account; tier 3 is address verified.
export const KYC_TIER_IDENTITY = 2;
export const KYC_TIER_ADDRESS = 3;

// Smallest withdrawal accepted, for any account.
export const WITHDRAWAL_MIN_PER_TRANSACTION = 1000;

// The ceiling every account starts on — the default for users.withdrawal_limit
// until KYC is approved or an admin changes it. It caps both a single
// transaction and the running day total — capping only the transaction would be
// no cap at all, since the same amount could simply be withdrawn again.
// Changing this only affects accounts created afterwards; the column default in
// migration 1783400000000 has to move with it.
export const WITHDRAWAL_MAX_UNVERIFIED = 50000;

// A PIN reset only needs access to the account's email, so it is the cheapest
// path in for whoever has taken over an inbox. Money is frozen for this long
// afterwards to leave the real owner time to notice the reset email and call
// support. It blocks withdrawals and P2P transfers only — bill payments are
// small and capped, and freezing them would strand users mid-emergency.
export const PIN_RESET_FREEZE_HOURS = 24;

// ─── Referrals ───────────────────────────────────────────────────────────────
// A referrer earns REFERRAL_REWARD_NGN once — and only once — per person they
// referred, the moment that person's lifetime successful deposits cross
// REFERRAL_QUALIFYING_DEPOSIT_USD. Both figures are shown to users in the app,
// so they are defined here rather than inline at the check.
export const REFERRAL_REWARD_NGN = 1500;
export const REFERRAL_QUALIFYING_DEPOSIT_USD = 2000;
export const REFERRAL_CODE_LENGTH = 7;

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
