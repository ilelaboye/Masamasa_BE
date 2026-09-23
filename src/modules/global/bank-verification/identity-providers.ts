/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Prembly identity endpoints, one entry per ID type.
 *
 * Every endpoint takes a different request body and answers in a different
 * shape, so the differences live here as data rather than as a branch per type
 * in the service. The mobile app carries the mirror image of this table (which
 * fields to ask the user for) in `kyc_flow.dart`.
 *
 * Everything in this file is pure — see identity-providers.spec.ts.
 */

const PREMBLY = "https://api.prembly.com/verification";

export type IdentityType =
  | "bvn"
  | "nin"
  | "passport"
  | "drivers_license"
  | "voters_card";

/** What the user supplied, plus the account's own names to verify against. */
export interface IdentityInput {
  number: string;
  dob?: string;
  /** Passport only: the holder's NIN, which the endpoint cross-checks. */
  nin?: string;
  first_name: string;
  last_name: string;
}

export interface IdentityProvider {
  url: string;
  body: (input: IdentityInput) => Record<string, unknown>;
  /** The provider says the ID exists and the lookup succeeded. */
  verified: (res: any) => boolean;
  /**
   * The name parts the provider returned, for us to match against the account.
   * `null` means the provider matched the names itself from what we sent —
   * there is nothing for us to compare.
   */
  names: (res: any) => (string | undefined)[] | null;
  /** The birthdate the provider holds, when it returns one. */
  dob: (res: any) => string | undefined;
}

export const IDENTITY_PROVIDERS: Record<IdentityType, IdentityProvider> = {
  bvn: {
    url: `${PREMBLY}/bvn_validation`,
    body: ({ number }) => ({ number }),
    verified: (res) => Boolean(res?.status),
    names: (res) => [
      res?.data?.firstName,
      res?.data?.lastName,
      res?.data?.middleName,
    ],
    dob: (res) => res?.data?.dateOfBirth,
  },

  nin: {
    url: `${PREMBLY}/vnin-basic`,
    body: ({ number }) => ({ number }),
    verified: (res) => Boolean(res?.status),
    names: (res) => [
      res?.data?.firstname,
      res?.data?.surname,
      res?.data?.middlename,
    ],
    // Returned as DD-MM-YYYY, unlike every other endpoint here.
    dob: (res) => res?.data?.birthdate,
  },

  passport: {
    url: `${PREMBLY}/national_passport_v2`,
    // Takes the passport number, the holder's NIN and date of birth — see
    // https://docs.prembly.com/reference/passport-version-2
    body: ({ number, nin, dob }) => ({ number, nin, dob }),
    verified: (res) => Boolean(res?.status),
    names: (res) => [
      res?.data?.firstName,
      res?.data?.lastName,
      res?.data?.middleName,
    ],
    dob: (res) => res?.data?.dateOfBirth,
  },

  drivers_license: {
    url: `${PREMBLY}/drivers_license`,
    body: ({ number, dob, first_name, last_name }) => ({
      number,
      dob,
      first_name,
      last_name,
    }),
    // FRSC matches the names and date of birth we send and answers with a
    // verdict — there are no details in the response to compare ourselves.
    verified: (res) =>
      Boolean(res?.status) && Boolean(res?.frsc_data?.verified),
    names: () => null,
    dob: () => undefined,
  },

  voters_card: {
    url: `${PREMBLY}/voters_card`,
    body: ({ number }) => ({ number }),
    verified: (res) => Boolean(res?.status),
    names: (res) => [res?.data?.fullName],
    dob: (res) => res?.data?.date_of_birth,
  },
};

/**
 * Why a verification did not pass.
 *
 * The split that matters is whose problem it is. The first group is something
 * the user can act on — a wrong number, a name that does not match. The second
 * is ours: our Prembly wallet has run dry, our key is rejected, their service
 * is down. Telling someone "we could not find your ID" when our billing
 * lapsed sends them round in circles retrying a thing that cannot work, so
 * those never reach the user as a rejection.
 */
export type FailureReason =
  | "ID_NOT_FOUND"
  | "ID_INVALID"
  | "ID_BLOCKED"
  | "NAME_MISMATCH"
  | "DOB_MISMATCH"
  | "DETAILS_MISMATCH"
  | "DOCUMENT_UNREADABLE"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_RETRYING"
  | "PROVIDER_ACCOUNT"
  | "RATE_LIMITED";

/** Reasons that are our problem, not the user's. */
const OPERATIONAL: FailureReason[] = [
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_RETRYING",
  "PROVIDER_ACCOUNT",
  "RATE_LIMITED",
];

export function isOperational(reason: FailureReason): boolean {
  return OPERATIONAL.includes(reason);
}

/**
 * Reads Prembly's verdict out of a 200 response.
 *
 * Prembly answers HTTP 200 for failures too and puts the real outcome in
 * `response_code`, so a 200 is not a pass. Returns null when the response is
 * genuinely successful.
 *
 * Codes: 00 success · 01 record not found · 02 service unavailable ·
 * 03 insufficient wallet balance (ours) · 07 blocked/watch-listed.
 */
export function classifyResponse(res: any): FailureReason | null {
  switch (String(res?.response_code ?? "")) {
    case "00":
      break;
    case "01":
      return "ID_NOT_FOUND";
    case "02":
      return "PROVIDER_UNAVAILABLE";
    case "03":
      // Our prepaid balance, nothing to do with this user.
      return "PROVIDER_ACCOUNT";
    case "07":
      return "ID_BLOCKED";
  }

  switch (String(res?.verification?.status ?? "").toUpperCase()) {
    case "NOT-VERIFIED":
    case "NOT_VERIFIED":
      return "ID_INVALID";
    case "PENDING":
      // Their side failed and will retry — not a verdict on the ID.
      return "PROVIDER_RETRYING";
  }

  // No code and no status: fall back to the top-level flag.
  if (!res?.status) return "ID_NOT_FOUND";

  return null;
}

/** Classifies a non-2xx response or a transport failure. */
export function classifyHttpError(error: any): FailureReason {
  const status = error?.response?.status;

  if (status === 429) return "RATE_LIMITED";
  // Our key, our permissions — never the user's doing.
  if (status === 401 || status === 403) return "PROVIDER_ACCOUNT";
  // Documented as a malformed request or an invalid ID format. The only part
  // of the request that varies per user is the ID itself.
  if (status === 400 || status === 422) return "ID_INVALID";

  // 5xx, timeouts and network failures alike.
  return "PROVIDER_UNAVAILABLE";
}

/** Prembly's document endpoint understands these five document codes. */
export const DOCUMENT_CODES: Record<string, string> = {
  nin: "ID",
  voters_card: "ID",
  other: "ID",
  passport: "PP",
  drivers_license: "DL",
  // Tier 3's proof of address will use the same endpoint with "UB".
  utility_bill: "UB",
};

/**
 * Splits names into comparable lowercase tokens. Punctuation and hyphens
 * become separators so "Ilelaboye-Tayo" and "Ilelaboye Tayo" match, and a full
 * name in one string tokenises the same as three separate fields.
 */
export function nameTokens(...parts: (string | null | undefined)[]): string[] {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

/**
 * Matches the name on the account against the name the provider holds.
 *
 * Users split their names across the two fields inconsistently — a person
 * registered as first "lekan", middle "tayo", last "ilelaboye" may enter it as
 * first_name "lekan tayo" / last_name "ilelaboye", or first_name "lekan" /
 * last_name "tayo ilelaboye". Comparing whole fields rejects both, so instead
 * every word the user supplied must match a distinct word on the record
 * (order-independent).
 *
 * At least two distinct record words must be matched, so a single repeated
 * name cannot pass verification on its own.
 */
export function namesMatch(
  recordParts: (string | null | undefined)[],
  first_name: string,
  last_name: string,
): boolean {
  const recordTokens = nameTokens(...recordParts);
  // Deduped: repeating a name must not count as two separate matches.
  const userTokens = [...new Set(nameTokens(first_name, last_name))];

  if (recordTokens.length === 0 || userTokens.length === 0) return false;

  const unmatched = [...recordTokens];
  for (const token of userTokens) {
    const index = unmatched.indexOf(token);
    if (index === -1) return false; // a supplied name is not on the record
    unmatched.splice(index, 1);
  }

  return recordTokens.length - unmatched.length >= 2;
}

/**
 * Normalises a date to YYYY-MM-DD so dates from different endpoints can be
 * compared as strings.
 *
 * Prembly is not consistent: NIN answers DD-MM-YYYY, the passport endpoint
 * answers YYYY-MM-DD, and `new Date("21-08-1994")` is Invalid Date in Node, so
 * parsing has to be explicit. A four-digit leading group is read as a year;
 * otherwise the first group is the day.
 *
 * Returns null when there is no date to compare, which callers treat as "no
 * check possible" rather than as a mismatch.
 */
export function normaliseDob(value: unknown): string | null {
  if (!value) return null;

  const match = String(value)
    .trim()
    .match(/^(\d{1,4})\D(\d{1,2})\D(\d{1,4})/);
  if (!match) return null;

  const [, a, b, c] = match;
  const pad = (part: string) => part.padStart(2, "0");

  const [year, month, day] = a.length === 4 ? [a, b, c] : [c, b, a];
  if (year.length !== 4) return null;

  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * True only when both dates are present and differ. An absent date on either
 * side is not a mismatch — the driver's licence endpoint returns no birthdate
 * at all, and a document scan may not carry one.
 */
export function dobMismatch(recordDob: unknown, suppliedDob: unknown): boolean {
  const record = normaliseDob(recordDob);
  const supplied = normaliseDob(suppliedDob);
  if (!record || !supplied) return false;
  return record !== supplied;
}
