import { MANUAL_REVIEW_TYPES } from "@/modules/global/bank-verification/identity-providers";
import { KycValidation } from "./kyc.validation";

/**
 * Tier 2 has two routes and this schema is the only thing keeping them apart
 * on the wire. The costly direction is a manual-review type arriving with a
 * number: nothing looks it up, so accepting it would record a submission the
 * user believes was verified.
 */

const image = "data:image/jpeg;base64,AAAA";
const err = (value: unknown) => KycValidation.validate(value).error?.message;

describe.each(MANUAL_REVIEW_TYPES)("%s (admin reviews the photo)", (type) => {
  it("accepts the front image on its own", () => {
    expect(err({ type, front_image: image })).toBeUndefined();
    expect(err({ type, front_image: image, selfie: image })).toBeUndefined();
  });

  it("refuses a submission with no document", () => {
    // There is no provider to ask — with no image there is nothing to review,
    // so this can never be queued.
    expect(err({ type })).toBeDefined();
  });

  it("refuses an ID number", () => {
    // A client still sending one is a stale build expecting a verdict it will
    // never get.
    expect(err({ type, number: "B50000947", dob: "1994-08-21" })).toMatch(
      /number/,
    );
  });
});

describe("bvn and nin (looked up with the issuing authority)", () => {
  it("accepts a number with a date of birth", () => {
    expect(
      err({ type: "bvn", number: "12345678901", dob: "1994-08-21" }),
    ).toBeUndefined();
  });

  it("never takes a number without a date of birth", () => {
    // Every lookup either sends the dob or returns one to check against.
    expect(err({ type: "nin", number: "12345678901" })).toBeDefined();
  });

  it("still requires one of the two ways in", () => {
    expect(err({ type: "bvn" })).toBeDefined();
  });
});
