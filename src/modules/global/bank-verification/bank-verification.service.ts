import { appConfig } from "@/config";
import { hashResourceSync, verifyHash } from "@/core/utils";
import { axiosClient } from "@/core/utils/axiosClient";
import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BankAccountVerificationDto } from "./dto/bank-account-verification.dto";
import {
  BankVerification,
  BankVerificationType,
} from "./entities/bank-verification.entity";
import {
  DOCUMENT_CODES,
  FailureReason,
  IDENTITY_PROVIDERS,
  IdentityInput,
  IdentityType,
  classifyHttpError,
  classifyResponse,
  dobMismatch,
  isOperational,
  namesMatch,
} from "./identity-providers";
import { WinstonLogger } from "../logger/winston-logger";

const PREMBLY_BASE = "https://api.prembly.com/verification";

/**
 * Fields a provider may echo back that must never be persisted — the ID
 * number itself, and the holder's photo.
 */
const SENSITIVE_FIELDS = [
  "bvn",
  "number",
  "nin",
  "vin",
  "base64Image",
  "photo",
];

/**
 * The verdict a verification returns. `unavailable` is a provider problem
 * rather than a rejection, and callers route it to manual review.
 */
export type IdentityResult =
  | { outcome: "verified"; data: unknown }
  /** The user can act on this: a wrong number, a name that does not match. */
  | { outcome: "mismatch"; reason: FailureReason }
  /** Our side or Prembly's. Never reported to the user as a rejection. */
  | { outcome: "unavailable"; reason: FailureReason };

/** The stored fingerprint of an ID number: first three and last three. */
function numberExcerpt(value: string): string {
  return value.slice(0, 3) + value.slice(-3);
}

/** Accepts either a bare base64 string or a `data:image/jpeg;base64,...` URI. */
function stripDataUri(image: string): string {
  return image.replace(/^data:[^;]+;base64,/, "");
}

@Injectable()
export class BankVerificationService {
  constructor(
    @InjectRepository(BankVerification)
    private readonly bankVerificationRepository: Repository<BankVerification>,
  ) {}

  private readonly logger = new WinstonLogger();

  /**
   * Sorts a reason into the right outcome and, when it is ours rather than the
   * user's, writes it to the error log — a drained Prembly wallet or a
   * rejected key shows up as users failing verification and nowhere else.
   */
  private failure(reason: FailureReason, url: string): IdentityResult {
    if (isOperational(reason)) {
      this.logger.error(
        `Prembly verification unavailable (${reason}) calling ${url}`,
      );
      return { outcome: "unavailable", reason };
    }
    return { outcome: "mismatch", reason };
  }

  /**
   * Verifies a government ID by its number.
   *
   * Every ID type goes through here — which endpoint is called, what body it
   * takes and where the names live in the answer all come from
   * IDENTITY_PROVIDERS. The caller gets a verdict, never a raw provider
   * payload, so no route can accidentally hand a user someone else's details.
   */
  async verifyIdentity(
    type: IdentityType,
    input: IdentityInput,
    userId?: number,
  ): Promise<IdentityResult> {
    const provider = IDENTITY_PROVIDERS[type];
    if (!provider) {
      throw new BadRequestException("Unsupported government ID type");
    }

    await this.assertNotAlreadyUsed(type, input.number);

    // Prembly answers are untyped JSON; the provider table reads them.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response: any;
    try {
      response = await this.callPrembly(provider.url, provider.body(input));
      console.log(
        `response from ${type} verification, ${provider.url}`,
        response,
      );
    } catch (error) {
      console.error(`error from ${type} verification, ${provider.url}`, error);
      return this.failure(classifyHttpError(error), provider.url);
    }

    // A 200 from Prembly is not a pass — the verdict is in response_code.
    const reason = classifyResponse(response);
    console.log("reason", reason);
    if (reason) return this.failure(reason, provider.url);

    if (!provider.verified(response)) {
      // The lookup succeeded but the provider would not confirm the ID. FRSC
      // is the case that reaches here: it matches the name and date of birth
      // its own side and answers with a verdict rather than details.
      return this.failure("DETAILS_MISMATCH", provider.url);
    }

    // A null names list means the provider matched the names itself from what
    // we sent it (FRSC does this for driver's licences).
    const recordNames = provider.names(response);
    if (
      recordNames &&
      !namesMatch(recordNames, input.first_name, input.last_name)
    ) {
      return { outcome: "mismatch", reason: "NAME_MISMATCH" };
    }

    if (dobMismatch(provider.dob(response), input.dob)) {
      return { outcome: "mismatch", reason: "DOB_MISMATCH" };
    }

    const record = await this.recordVerification(
      type,
      input.number,
      response?.data ?? {},
      userId,
    );
    return { outcome: "verified", data: record.metadata };
  }

  /**
   * Verifies a photographed document and reads the holder's name off it.
   *
   * Only the name is matched against the account: the date of birth printed on
   * a document is read by OCR and a misread digit would reject a legitimate
   * user, so it is recorded but not used as a gate.
   */
  async verifyDocument(
    documentType: string,
    base64Image: string,
    input: Pick<IdentityInput, "first_name" | "last_name">,
    userId?: number,
  ): Promise<IdentityResult> {
    const docCode = DOCUMENT_CODES[documentType];
    if (!docCode) {
      throw new BadRequestException("Unsupported document type");
    }

    // Prembly answers are untyped JSON; the provider table reads them.
    const url = `${PREMBLY_BASE}/document`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response: any;
    try {
      response = await this.callPrembly(url, {
        doc_type: docCode,
        doc_image: stripDataUri(base64Image),
        doc_country: "NG",
      });
      console.log(
        `response from ${documentType} verification, ${url}`,
        response,
      );
    } catch (error) {
      console.log(`error from ${documentType} verification, ${url}`, error);
      return this.failure(classifyHttpError(error), url);
    }

    const reason = classifyResponse(response);
    // A document that could not be read comes back as "not found" — for a
    // photograph the honest advice is to retake it, not to check the number.
    if (reason) {
      return this.failure(
        reason === "ID_NOT_FOUND" ? "DOCUMENT_UNREADABLE" : reason,
        url,
      );
    }

    if (!response?.data) {
      return this.failure("DOCUMENT_UNREADABLE", url);
    }

    if (
      !namesMatch([response.data.fullName], input.first_name, input.last_name)
    ) {
      return { outcome: "mismatch", reason: "NAME_MISMATCH" };
    }

    // The number read off the document is what stops the same passport being
    // used to verify two accounts.
    const documentNumber = response.data.documentNumber;
    if (documentNumber) {
      await this.assertNotAlreadyUsed(documentType, documentNumber);
      const record = await this.recordVerification(
        documentType,
        documentNumber,
        response.data,
        userId,
      );
      return { outcome: "verified", data: record.metadata };
    }

    return { outcome: "verified", data: response.data };
  }

  private async callPrembly(url: string, body: Record<string, unknown>) {
    return axiosClient(url, {
      method: "POST",
      body,
      timeout: 60000,
      headers: { "x-api-key": appConfig.PREMBLY_IDENTITY_PASSAPIKEY },
    });
  }

  /**
   * One government ID verifies one account. The full number is never stored —
   * an excerpt narrows the lookup and the bcrypt hash confirms the match.
   */
  private async assertNotAlreadyUsed(type: string, value: string) {
    const excerpt = numberExcerpt(value);
    const existing = await this.bankVerificationRepository.find({
      where: { value: excerpt, type: type as BankVerificationType },
    });

    for (const record of existing) {
      if (await verifyHash(value, record.hashed_value)) {
        throw new BadRequestException(
          "This ID has already been used to verify another account",
        );
      }
    }
  }

  private async recordVerification(
    type: string,
    value: string,
    metadata: Record<string, unknown>,
    userId?: number,
  ) {
    // Whatever the provider sent back, the ID number itself is not kept in the
    // clear alongside it.
    const safeMetadata = { ...metadata };
    for (const field of SENSITIVE_FIELDS) delete safeMetadata[field];

    const verification = this.bankVerificationRepository.create({
      type: type as BankVerificationType,
      value: numberExcerpt(value),
      hashed_value: hashResourceSync(value),
      metadata: safeMetadata,
      user_id: userId,
    });
    await this.bankVerificationRepository.save(verification);

    delete verification.hashed_value;
    return verification;
  }

  async accountNumber(bankAccountVerificationDto: BankAccountVerificationDto) {
    const { accountNumber, bankCode, bankName } = bankAccountVerificationDto;

    const existingVerification = await this.bankVerificationRepository.findOne({
      where: { value: accountNumber },
    });
    if (existingVerification) {
      const verify = await verifyHash(
        bankCode,
        existingVerification.hashed_value,
      );
      delete existingVerification.hashed_value;

      if (verify)
        return {
          message: "Account number verified",
          data: existingVerification.metadata,
        };
    }

    try {
      const response = await axiosClient(
        `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        {
          headers: { Authorization: `Bearer ${appConfig.PAYSTACK_SECRET_KEY}` },
        },
      );
      if (!response.status)
        throw new BadRequestException("Account number verification failed");

      const verification = this.bankVerificationRepository.create({
        type: BankVerificationType.accountNumber,
        value: accountNumber,
        hashed_value: hashResourceSync(bankCode),
        metadata: { bank_name: bankName, ...response.data },
      });
      await this.bankVerificationRepository.save(verification);

      delete verification.hashed_value;

      return {
        message: "Account number verified",
        data: verification.metadata,
      };
    } catch (error) {
      throw new BadRequestException(error.response.data.message);
    }
  }
}
