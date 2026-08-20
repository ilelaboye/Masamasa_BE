import { appConfig } from "@/config";
import { generateAlphaNumericString } from "../helpers";
// Namespace import — a default import compiles to `crypto_1.default`, which
// is undefined at runtime for CommonJS modules without esModuleInterop.
import * as crypto from "crypto";

/**
 * Verifies a Quidax webhook signature (https://docs.quidax.io).
 * Header `quidax-signature` has the form `t={timestamp},s={signature}`;
 * the signature is HMAC-SHA256 over `{timestamp}.{JSON body}` using the
 * webhook signing secret (QUIDAX_SIGNATURE).
 */
export const verifyQuidaxWebhook = (
  payload: unknown,
  signatureHeader: string | undefined,
): boolean => {
  const secret = appConfig.QUIDAX_SIGNATURE;
  if (!secret) {
    // Validation is only enforced once the secret is configured — log loudly
    // so an unset env var doesn't silently disable it.
    console.warn(
      "[QuidaxWebhook] QUIDAX_SIGNATURE is not set — webhook signature NOT verified",
    );
    return true;
  }

  if (!signatureHeader) return false;

  console.log("signatureHeader", signatureHeader);

  const parts: Record<string, string> = {};
  for (const piece of signatureHeader.split(",")) {
    const [key, ...rest] = piece.split("=");
    parts[key?.trim()] = rest.join("=").trim();
  }
  const timestamp = parts["t"];
  const signature = parts["s"];
  if (!timestamp || !signature) return false;

  const signedPayload = `${timestamp}.${JSON.stringify(payload)}`;
  console.log("signedPayload", signedPayload);
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature, "hex"),
    );
  } catch {
    // Malformed / wrong-length signature
    return false;
  }
};

/**
 * A device label fit to show a user, or null when we genuinely cannot tell.
 *
 * The mobile app sends `x-device-name` ("iPhone (iOS 17.2)"). Anything else is
 * derived from the User-Agent. Returning null matters: HTTP clients that do
 * not identify themselves send things like `Dart/3.13 (dart:io)`, and printing
 * that in a security email tells the reader nothing about whether the login
 * was theirs — an omitted line is better than a misleading one.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const describeDevice = (req: any): string | null => {
  const declared = req?.headers?.["x-device-name"];
  if (typeof declared === "string" && declared.trim()) {
    // Header values are attacker-controlled and land in an HTML email, so
    // strip anything that could break out of the markup and cap the length.
    return declared
      .replace(/[<>&"']/g, "")
      .trim()
      .slice(0, 80);
  }

  const agent = req?.headers?.["user-agent"];
  if (typeof agent !== "string" || !agent.trim()) return null;

  // Bare HTTP-client UAs — our own older app builds, curl, Postman. None of
  // them say anything about the device.
  if (/^(Dart|dio|axios|node|okhttp|curl|PostmanRuntime|python)/i.test(agent)) {
    return null;
  }

  // Order is specific-before-generic, not alphabetical: an iPhone UA contains
  // "like Mac OS X" and an Android UA contains "Linux", so testing for macOS
  // or Linux first misreports both.
  const os = /(iPhone|iPad|iPod)/.test(agent)
    ? "iOS"
    : /Android/.test(agent)
      ? "Android"
      : /Windows NT/.test(agent)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(agent)
          ? "macOS"
          : /Linux|X11/.test(agent)
            ? "Linux"
            : null;

  // Edge and Opera also contain "Chrome", and Chrome contains "Safari", so the
  // order here is the specific-before-generic one, not alphabetical.
  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /OPR\//.test(agent)
      ? "Opera"
      : /Firefox\//.test(agent)
        ? "Firefox"
        : /Chrome\//.test(agent)
          ? "Chrome"
          : /Safari\//.test(agent)
            ? "Safari"
            : null;

  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os;
};

/**
 * Client context captured on user-initiated transactions so the admin can
 * see where and on what device a transaction was carried out.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getClientInfo = (req: any) => {
  const forwarded = req?.headers?.["x-forwarded-for"];
  const ip =
    (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : null) ??
    req?.ip ??
    req?.socket?.remoteAddress ??
    null;

  return {
    ip,
    // Kept raw for forensics; use device_name for anything a user reads.
    user_agent: req?.headers?.["user-agent"] ?? null,
    device_name: describeDevice(req),
    device_id: req?.user?.device_id ?? null,
  };
};

export const generateVtpassRequestId = (user_id) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0"); // Months are zero-based
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const masaId = `MASA${generateAlphaNumericString(10)}`; // Example of an alphanumeric string to concatenate

  return `${year}${month}${day}${hours}${minutes}${masaId}00${user_id}`;
};

export const verifyNombaWebhook = (payload, signatureValue, nombaTimeStamp) => {
  try {
    // const signatureValue = "Kt9095hQxfgmVbx6iz7G2tPhHdbdXgLlyY/mf35sptw=";
    // const nombaTimeStamp = "2025-09-29T10:51:44Z";
    const secret = appConfig.NOMBA_WEBHOOK_SECRET;
    console.log(`Using secret [${secret}]`);

    const mySig = generateSignature(payload, secret, nombaTimeStamp);

    console.log(`Generated signature [${mySig}]`);
    console.log(`Expected signature [${signatureValue}]`);

    if (signatureValue.toLowerCase() === mySig.toLowerCase()) {
      console.log(">>>>>>> Signatures match <<<<<<<<<<<");
    } else {
      console.log("<<<<<<<<< Signatures did not match >>>>>>>>>");
    }
  } catch (ex) {
    console.error("Error occurred while generating signature:", ex.message);
  }
};

export const generateSignature = (payload, secret, timeStamp) => {
  const requestPayload = payload;
  const data = requestPayload.data || {};
  const merchant = data.merchant || {};
  const transaction = data.transaction || {};

  const eventType = requestPayload.event_type || "";
  const requestId = requestPayload.requestId || "";
  const userId = merchant.userId || "";
  const walletId = merchant.walletId || "";
  const transactionId = transaction.transactionId || "";
  const transactionType = transaction.type || "";
  const transactionTime = transaction.time || "";
  let transactionResponseCode = transaction.responseCode || "";

  if (transactionResponseCode === "null") {
    transactionResponseCode = "";
  }

  const hashingPayload = `${eventType}:${requestId}:${userId}:${walletId}:${transactionId}:${transactionType}:${transactionTime}:${transactionResponseCode}:${timeStamp}`;

  console.log(`::: payload to hash --> [${hashingPayload}] :::`);

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(hashingPayload);
  const hash = hmac.digest("base64");

  return hash;
};

// Run
// hooksCron2();
