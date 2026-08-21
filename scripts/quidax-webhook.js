#!/usr/bin/env node
/**
 * Builds a signed Quidax webhook and prints a ready-to-run curl.
 *
 * A static payload is single-use here: the handler claims each event id in the
 * `webhooks` table for idempotency, and the signature is an HMAC over the exact
 * request body — so both have to be regenerated per attempt.
 *
 *   node scripts/quidax-webhook.js --address 0xabc... --currency usdt
 *   node scripts/quidax-webhook.js --event deposit.on_hold --amount 5
 *   node scripts/quidax-webhook.js --address rXYZ --currency xrp --tag 12345
 *   node scripts/quidax-webhook.js --send        # POST it instead of printing
 *
 * The address MUST match a row in `wallet` (address + currency), or the handler
 * returns early and nothing at all happens — no error, no log.
 */
require("dotenv").config();
const crypto = require("crypto");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const event = flag("event", "deposit.successful");
const currency = flag("currency", "usdt");
const amount = flag("amount", "150.5");
const network = flag("network", "bsc");
const address = flag("address", "0xREPLACE_WITH_A_REAL_WALLET_ADDRESS");
const destinationTag = flag("tag", null);
const quidaxId = flag("quidax-id", "REPLACE_WITH_QUIDAX_ID");
const secret = process.env.QUIDAX_SIGNATURE;
const port = process.env.PORT || 4000;
const url = flag("url", `http://localhost:${port}/webhook/quidax`);

const now = new Date().toISOString();
const payload = {
  event,
  data: {
    // Idempotency key. Fresh every run, otherwise the event is skipped as a
    // duplicate and the handler never runs.
    id: "dep_" + crypto.randomBytes(8).toString("hex"),
    type: "coin_address",
    currency,
    amount,
    fee: "0.0",
    txid: "0x" + crypto.randomBytes(32).toString("hex"),
    status: "accepted",
    reason: null,
    created_at: now,
    done_at: now,
    payment_address: {
      id: "pa_" + crypto.randomBytes(6).toString("hex"),
      currency,
      address,
      network,
      destination_tag: destinationTag,
      total_payments: "1",
    },
    user: { id: quidaxId, sn: "QX000000", email: "user@example.com" },
  },
};

// The server verifies against JSON.stringify() of the *parsed* body, so the
// signature has to be taken over this exact string — send it byte for byte,
// unformatted. Any reindenting invalidates it.
const body = JSON.stringify(payload);

let header = "";
if (secret) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  header = `t=${timestamp},s=${signature}`;
} else {
  console.warn(
    "! QUIDAX_SIGNATURE is not set — the server skips verification entirely.\n",
  );
}

if (args.includes("--send")) {
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(header ? { "quidax-signature": header } : {}),
    },
    body,
  })
    .then(async (res) => {
      console.log(`${res.status} ${res.statusText}`, await res.text());
      console.log(`\ndeposit id: ${payload.data.id}`);
    })
    .catch((err) => {
      console.error("Request failed:", err.message);
      process.exit(1);
    });
} else {
  console.log(JSON.stringify(payload, null, 2));
  console.log("\n--- curl ---\n");
  console.log(
    `curl -i -X POST ${url} \\\n` +
      `  -H 'Content-Type: application/json' \\\n` +
      (header ? `  -H 'quidax-signature: ${header}' \\\n` : "") +
      `  -d '${body}'`,
  );
}
