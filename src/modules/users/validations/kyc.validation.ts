import * as Joi from "joi";

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
 * Tier 2 identity verification. There are two ways to submit and exactly one
 * must be used: the ID number, or a photograph of the document.
 *
 * Every number lookup we support either takes a date of birth or returns one
 * to check the answer against, so `number` never arrives without `dob`.
 */
export const KycValidation = Joi.object()
  .keys({
    type: Joi.string()
      .valid(...ID_TYPES)
      .required(),
    number: Joi.string().min(6).max(30),
    dob: Joi.date().label("Date of birth"),
    // The passport endpoint cross-checks the holder's NIN, so a passport
    // number lookup cannot go up without one.
    nin: Joi.string()
      .length(11)
      .pattern(/^\d+$/)
      .label("NIN")
      .when("number", {
        is: Joi.exist(),
        then: Joi.when("type", { is: "passport", then: Joi.required() }),
      }),
    front_image: base64Image,
    back_image: base64Image,
    selfie: base64Image,
  })
  .or("number", "front_image")
  .and("number", "dob");

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
