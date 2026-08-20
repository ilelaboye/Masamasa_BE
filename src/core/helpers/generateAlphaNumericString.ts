export const generateAlphaNumericString = (length = 20): string => {
  const chars =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    password += chars[randomIndex];
  }
  return password;
};

export const generateMasamasaRef = (): string => {
  return `MASA${generateAlphaNumericString(10)}00${Date.now()}`;
};

/**
 * Alphabet for referral codes. Uppercase-only and missing the characters that
 * are read wrong when a code is typed off a screenshot or spoken aloud —
 * 0/O, 1/I/L. The migration that backfills existing users uses the same set,
 * so every code in the table comes from one alphabet.
 */
export const REFERRAL_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * A referral code: 7 characters from [REFERRAL_CODE_ALPHABET].
 *
 * 31^7 ≈ 27.5 billion combinations, so collisions are rare — but not
 * impossible, which is why the column carries a unique index and callers
 * retry rather than trusting a single draw.
 */
export const generateReferralCode = (length = 7): string => {
  let code = "";
  for (let i = 0; i < length; i++) {
    code +=
      REFERRAL_CODE_ALPHABET[
        Math.floor(Math.random() * REFERRAL_CODE_ALPHABET.length)
      ];
  }
  return code;
};
