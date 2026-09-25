import * as Joi from "joi";
import { MANUAL_REVIEW_TYPES } from "@/modules/global/bank-verification/identity-providers";

/**
 * A base64 image on the wire. Capped so an oversized upload is rejected at the
 * edge rather than after it has been read into memory and forwarded to
 * Prembly — roughly 6MB of image, well above what the app sends after it
 * downscales a capture.
 */
const base64Image = Joi.string().max(8_000_000);

export const ID_TYPES = [
  "bvn",
  "nin",
  "passport",
  "drivers_license",
  "voters_card",
  "other",
];

/**
 * Tier 2 identity verification. Which fields are legal depends entirely on the
 * ID type, because the two types have nothing in common:
 *
 * - **Number lookup** (BVN, NIN, and `other`): the number is checked with the
 *   issuing authority and settles immediately. Every lookup we support either
 *   takes a date of birth or returns one to check the answer against, so
 *   `number` never arrives without `dob`.
 * - **Manual review** (passport, driver's licence, voter's card): the front of
 *   the document is uploaded and an admin decides. There is no endpoint to
 *   call, so a `number` here is not merely unused — accepting one would imply a
 *   verification that never happens. It is rejected outright.
 *
 * The image is required on the manual path for the same reason tier 3 requires
 * one: with no document there is nothing for an admin to review, so the
 * submission cannot be queued.
 */
export const KycValidation = Joi.object()
  .keys({
    type: Joi.string()
      .valid(...ID_TYPES)
      .required(),
    number: Joi.string().min(6).max(30),
    dob: Joi.date().label("Date of birth"),
    front_image: base64Image,
    back_image: base64Image,
    selfie: base64Image,
  })
  .when(
    Joi.object({
      type: Joi.valid(...MANUAL_REVIEW_TYPES).required(),
    }).unknown(),
    {
      then: Joi.object({
        front_image: base64Image.required().label("Document photo"),
        // Rejected rather than stripped: a client still sending a number is a
        // stale build that believes it is getting an instant verdict.
        number: Joi.forbidden(),
        dob: Joi.forbidden(),
      }),
      otherwise: Joi.object().or("number", "front_image").and("number", "dob"),
    },
  );

/**
 * What counts as a proof of address. Stored as-is on the user so the admin
 * reviewing the document knows what they are looking at; the mobile flow
 * mirrors this list.
 */
export const ADDRESS_PROOF_TYPES = [
  "electricity_bill",
  "water_bill",
  "government_correspondence",
  "other",
];

/**
 * Tier 3 address verification. Unlike tier 2 there is no provider to ask —
 * the document is reviewed by an admin, so everything here is simply recorded
 * and queued. The image is the whole point of the submission and is required.
 */
export const AddressKycValidation = Joi.object().keys({
  address: Joi.string().min(5).max(255).required().label("Address"),
  city: Joi.string().max(100).required().label("City"),
  state: Joi.string().max(100).required().label("State"),
  country: Joi.string().max(100).required().label("Country"),
  postal_code: Joi.string().max(20).allow("", null).label("Postal code"),
  document_type: Joi.string()
    .valid(...ADDRESS_PROOF_TYPES)
    .required()
    .label("Document type"),
  document_image: base64Image.required().label("Document"),
});
