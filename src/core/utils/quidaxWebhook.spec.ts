import * as crypto from "crypto";
import { appConfig } from "@/config";
import { verifyQuidaxWebhook } from "./general";

/**
 * This webhook credits deposits, so the failure that matters is accepting a
 * request it cannot authenticate — above all when the secret is missing.
 */

const SECRET = "test-quidax-secret";
const payload = { event: "deposit.successful", data: { id: "d1", amount: "5" } };

const sign = (body: unknown, secret = SECRET, t = "1700000000") =>
  `t=${t},s=${crypto.createHmac("sha256", secret).update(`${t}.${JSON.stringify(body)}`).digest("hex")}`;

describe("verifyQuidaxWebhook", () => {
  const original = appConfig.QUIDAX_SIGNATURE;
  beforeEach(() => (appConfig.QUIDAX_SIGNATURE = SECRET));
  afterAll(() => (appConfig.QUIDAX_SIGNATURE = original));

  it("accepts a correctly signed payload", () => {
    expect(verifyQuidaxWebhook(payload, sign(payload))).toBe(true);
  });

  it("rejects everything when the secret is not configured", () => {
    appConfig.QUIDAX_SIGNATURE = "";
    expect(verifyQuidaxWebhook(payload, sign(payload, ""))).toBe(false);
    expect(verifyQuidaxWebhook(payload, undefined)).toBe(false);
  });

  it("rejects a missing, malformed or wrong signature", () => {
    expect(verifyQuidaxWebhook(payload, undefined)).toBe(false);
    expect(verifyQuidaxWebhook(payload, "garbage")).toBe(false);
    expect(verifyQuidaxWebhook(payload, sign(payload, "other-secret"))).toBe(false);
  });

  it("rejects a payload altered after signing", () => {
    const tampered = { ...payload, data: { ...payload.data, amount: "5000" } };
    expect(verifyQuidaxWebhook(tampered, sign(payload))).toBe(false);
  });
});
