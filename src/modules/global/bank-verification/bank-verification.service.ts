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
    private readonly bankVerificationRepository: Repository<BankVerification>
  ) {}

  verifyUserDetailsWithBvn(bvnDetails, userDetails: BVNUserDto) {
    console.log("bvnDetails", bvnDetails);
    console.log("userDetails", userDetails);
    if (!userDetails) return false;
    const { first_name, last_name, gender, dob } = userDetails;

    const bnvName = `${bvnDetails.firstName.toLowerCase()} ${bvnDetails.lastName.toLowerCase()} ${bvnDetails.middleName.toLowerCase()}`;

    const isNameVerified =
      bnvName.includes(first_name.toLowerCase()) &&
      bnvName.includes(last_name.toLowerCase());
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
        const detailsVerification = this.verifyUserDetailsWithBvn(
          existingVerification.metadata,
          bvnUserDto
        );
        delete existingVerification.hashed_value;

        if (!detailsVerification)
          return { success: false, data: existingVerification };
        return { success: true, data: existingVerification };
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
        }
      );
      if (!response.status) return { success: false, data: null };
      console.log("response", response);
      // const responseBvn = response.data.number;
      delete response.data.bvn;
      delete response.data.number;
      delete response.data.base64Image;

      const verification = this.bankVerificationRepository.create({
        type: BankVerificationType.bvn,
        value: bvnExcerpt,
        hashed_value: hashResourceSync(bvn),
        metadata: response.data,
      });

      await this.bankVerificationRepository.save(verification);
      delete verification.hashed_value;

      const detailsVerification = this.verifyUserDetailsWithBvn(
        response.data,
        bvnUserDto
      );
      if (!detailsVerification) return { success: false, data: verification };

      return { success: true, data: verification };
    } catch (error) {
      const errorResponse = error.response?.data || {};
      const errorMessage =
        errorResponse.message ||
        "There was an error processing this request, please try again later";
      throw new BadRequestException(errorMessage);
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
        existingVerification.hashed_value
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
        }
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
