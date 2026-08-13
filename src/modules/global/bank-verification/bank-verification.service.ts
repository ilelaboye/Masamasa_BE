import { appConfig } from "@/config";
import { hashResourceSync, verifyHash } from "@/core/utils";
import { axiosClient } from "@/core/utils/axiosClient";
import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BankAccountVerificationDto } from "./dto/bank-account-verification.dto";
import { BVNUserDto } from "./dto/bvn-verification.dto";
import {
  BankVerification,
  BankVerificationType,
} from "./entities/bank-verification.entity";

@Injectable()
export class BankVerificationService {
  constructor(
    @InjectRepository(BankVerification)
    private readonly bankVerificationRepository: Repository<BankVerification>,
  ) {}

  /**
   * Splits a name into comparable lowercase tokens. Punctuation and hyphens
   * become separators so "Ilelaboye-Tayo" and "Ilelaboye Tayo" match.
   */
  private nameTokens(...parts: (string | null | undefined)[]): string[] {
    return parts
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 0);
  }

  /**
   * Matches the name the user typed against the name on their BVN.
   *
   * Users split their names across the two fields inconsistently — a person
   * registered on BVN as first "lekan", middle "tayo", last "ilelaboye" may
   * enter it as first_name "lekan tayo" / last_name "ilelaboye", or
   * first_name "lekan" / last_name "tayo ilelaboye". Comparing whole fields
   * rejects both, so instead every word the user supplied must match a
   * distinct word on the BVN record (order-independent).
   *
   * At least two distinct BVN words must be matched, so a single repeated
   * name cannot pass verification on its own.
   */
  private verifyNameAgainstBvn(
    bvnDetails,
    first_name: string,
    last_name: string,
  ): boolean {
    const bvnTokens = this.nameTokens(
      bvnDetails?.firstName,
      bvnDetails?.lastName,
      bvnDetails?.middleName,
    );
    // Deduped: repeating a name must not count as two separate matches.
    const userTokens = [...new Set(this.nameTokens(first_name, last_name))];

    if (bvnTokens.length === 0 || userTokens.length === 0) return false;

    const unmatchedBvnTokens = [...bvnTokens];
    for (const token of userTokens) {
      const index = unmatchedBvnTokens.indexOf(token);
      if (index === -1) return false; // a supplied name is not on the BVN
      unmatchedBvnTokens.splice(index, 1);
    }

    const matchedCount = bvnTokens.length - unmatchedBvnTokens.length;
    return matchedCount >= 2;
  }

  verifyUserDetailsWithBvn(bvnDetails, userDetails: BVNUserDto) {
    console.log("bvnDetails", bvnDetails);
    console.log("userDetails", userDetails);
    if (!userDetails) return false;
    const { first_name, last_name, gender, dob } = userDetails;

    const isNameVerified = this.verifyNameAgainstBvn(
      bvnDetails,
      first_name,
      last_name,
    );
    const isDobVerified =
      new Date(bvnDetails.dateOfBirth).toLocaleDateString() ==
      new Date(dob).toLocaleDateString();

    console.log("isNameVerified", isNameVerified);
    console.log("isDobVerified", isDobVerified);

    return isNameVerified && isDobVerified;
  }

  async bvnVerification(bvn: string, bvnUserDto: BVNUserDto) {
    const bvnExcerpt = bvn.slice(0, 3) + bvn.slice(bvn.length - 3, bvn.length);
    const existingVerification = await this.bankVerificationRepository.findOne({
      where: { value: bvnExcerpt, type: BankVerificationType.bvn },
    });

    if (existingVerification) {
      const verify = await verifyHash(bvn, existingVerification.hashed_value);
      delete existingVerification.hashed_value;

      if (verify) {
        throw new BadRequestException(
          "BVN has already been verified for another user",
        );
      }
    }

    try {
      const response = await axiosClient(
        `https://api.prembly.com/verification/bvn_validation`,
        {
          method: "POST",
          body: { number: bvn },
          headers: {
            "x-api-key": appConfig.PREMBLY_IDENTITY_PASSAPIKEY,
            // "app-id": appConfig.PREMBLY_IDENTITY_PASSAPPID,
          },
        },
      );
      if (!response.status) return { success: false, data: null };
      console.log("response", response);
      // const responseBvn = response.data.number;
      delete response.data.bvn;
      delete response.data.number;
      delete response.data.base64Image;

      const detailsVerification = this.verifyUserDetailsWithBvn(
        response.data,
        bvnUserDto,
      );
      // if (!detailsVerification) return { success: false, data: verification };
      if (!detailsVerification)
        throw new BadRequestException("BVN details do not match user details");

      const verification = this.bankVerificationRepository.create({
        type: BankVerificationType.bvn,
        value: bvnExcerpt,
        hashed_value: hashResourceSync(bvn),
        metadata: response.data,
      });

      await this.bankVerificationRepository.save(verification);
      delete verification.hashed_value;

      return { success: true, data: verification };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
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
