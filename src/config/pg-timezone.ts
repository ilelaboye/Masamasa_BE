import { defaults, types } from "pg";

/**
 * Makes Postgres `timestamp` columns unambiguously UTC on both sides.
 *
 * ── The bug this fixes ────────────────────────────────────────────────────
 * Every date column here is `timestamp without time zone`, which stores a bare
 * wall clock with no offset. Whoever writes it decides the timezone, and
 * whoever reads it guesses:
 *
 *   - `created_at`/`updated_at` are written by Postgres (`DEFAULT now()`),
 *     in the *database session's* timezone — UTC.
 *   - node-postgres reads a bare timestamp as the *Node process's* local time,
 *     which is Africa/Lagos (TZ in .env).
 *
 * Written at 09:00 WAT, Postgres stores "08:00"; Node reads "08:00" as Lagos
 * and reports 07:00Z. Every created_at came back exactly one hour early, so a
 * notification created on login rendered as "1 hour ago".
 *
 * ── The fix ───────────────────────────────────────────────────────────────
 * Pin both directions to UTC:
 *
 *   - reads:  parse a bare timestamp as UTC rather than as process-local.
 *   - writes: serialise Date parameters as UTC rather than with the local
 *             offset, so values Node supplies (last_seen_at, token_created_at)
 *             match the UTC that `DEFAULT now()` already writes.
 *
 * Both halves are required. The read fix alone would correct `created_at` but
 * push every Node-written column an hour the other way — including
 * `token_created_at`, which OTP expiry is measured against, so codes would
 * have looked an hour old and expired on arrival.
 *
 * ── Caveats ───────────────────────────────────────────────────────────────
 * Rows Node wrote *before* this change hold Lagos wall clock and now read an
 * hour early. That is self-correcting for short-lived values (OTP tokens) and
 * cosmetic for `last_seen_at`. `created_at`/`updated_at` were always UTC, so
 * the whole history of those columns becomes correct immediately.
 *
 * Must be imported before the connection pool is created — typeorm.config.ts
 * does that, and it is the only place that should.
 */

/** OID 1114 = `timestamp without time zone`. */
const PG_TIMESTAMP_OID = 1114;
/** OID 1115 = `timestamp without time zone[]`. */
const PG_TIMESTAMP_ARRAY_OID = 1115;

types.setTypeParser(PG_TIMESTAMP_OID, (value: string) =>
  // The bare value is UTC; the trailing Z is what says so. Kept as a string
  // append rather than Date.UTC(...) parsing so fractional seconds survive.
  value === null ? null : new Date(`${value.replace(" ", "T")}Z`),
);

// Arrays of timestamps are parsed by a different entry; left on the default
// parser deliberately — nothing in this schema uses one, and a half-applied
// conversion is worse than a consistent absence. Declared here so the omission
// reads as a decision rather than an oversight.
void PG_TIMESTAMP_ARRAY_OID;

// `timestamptz` (OID 1184) already carries an offset and is parsed correctly
// by default — it is deliberately untouched.

defaults.parseInputDatesAsUTC = true;
