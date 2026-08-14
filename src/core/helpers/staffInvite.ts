import { createHash, randomBytes } from "crypto";

/** How long a staff invite link stays valid, in hours. */
export const INVITE_EXPIRY_HOURS = 48;

export const hashInviteToken = (raw: string) =>
  createHash("sha256").update(raw).digest("hex");

/**
 * Issues a fresh staff invite token.
 *
 * Only the hash is stored. The raw value exists solely in the emailed link, so
 * a leaked `administrators` row cannot be replayed into an accepted invite.
 * SHA-256 rather than bcrypt because the token must be looked up by value.
 */
export const generateInviteToken = () => {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashInviteToken(raw) };
};
