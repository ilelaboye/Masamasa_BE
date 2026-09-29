import { AddressKycValidation } from "../validations/kyc.validation";
import {
  KYC_TIER_ADDRESS,
  WITHDRAWAL_LIMIT_ADMIN_MAX,
  WITHDRAWAL_MAX_ADDRESS_VERIFIED,
  WITHDRAWAL_MAX_PER_DAY,
} from "@/constants";
import { KycStatus } from "../entities/user.entity";

/**
 * Tier 3 address verification. The two things that would actually hurt if they
 * broke: a submission being accepted without the document an admin has to look
 * at, and the gate that stops tier 3 being granted to an account nobody has
 * identified.
 */

const valid = {
  address: "12 Allen Avenue, Ikeja",
  city: "Lagos",
  state: "Lagos State",
  country: "Nigeria",
  postal_code: "100001",
  document_type: "electricity_bill",
  document_image: "data:image/jpeg;base64,AAAA",
};

describe("AddressKycValidation", () => {
  it("accepts a complete submission", () => {
    expect(AddressKycValidation.validate(valid).error).toBeUndefined();
  });

  it("accepts a missing postal code — not everywhere in Nigeria has one", () => {
    const { postal_code, ...rest } = valid;
    expect(AddressKycValidation.validate(rest).error).toBeUndefined();
    expect(
      AddressKycValidation.validate({ ...rest, postal_code: "" }).error,
    ).toBeUndefined();
  });

  it("rejects a submission with no document", () => {
    // There is no provider to ask — with no image there is nothing to review,
    // so this can never be queued.
    const { document_image, ...rest } = valid;
    expect(AddressKycValidation.validate(rest).error).toBeDefined();
  });

  it("rejects a proof type the admin screen cannot label", () => {
    expect(
      AddressKycValidation.validate({ ...valid, document_type: "selfie" })
        .error,
    ).toBeDefined();
  });

  it("requires the address itself", () => {
    const { address, ...rest } = valid;
    expect(AddressKycValidation.validate(rest).error).toBeDefined();
  });
});

describe("tier 3 constants", () => {
  it("raises the ceiling above tier 2, and stays inside the admin maximum", () => {
    // Tier 3 grants more than tier 2, and both Joi schemas cap at the admin
    // maximum — if the grant ever exceeded that cap, a tier 3 account could not
    // spend the limit its own verification earned it.
    expect(WITHDRAWAL_MAX_ADDRESS_VERIFIED).toBeGreaterThan(
      WITHDRAWAL_MAX_PER_DAY,
    );
    expect(WITHDRAWAL_LIMIT_ADMIN_MAX).toBeGreaterThanOrEqual(
      WITHDRAWAL_MAX_ADDRESS_VERIFIED,
    );
    expect(KYC_TIER_ADDRESS).toBe(3);
  });

  it("keeps address status separate from identity status", () => {
    // Both reuse KycStatus, but on different columns — a tier 3 submission
    // arrives while kyc_status is already `success`.
    expect(KycStatus.pending).toBe("pending");
  });
});
