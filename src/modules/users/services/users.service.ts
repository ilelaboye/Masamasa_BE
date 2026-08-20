import { type UserRequest } from "@/definitions";
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { BaseService } from "../../base.service";
import { KycStatus, User } from "../entities/user.entity";
import {
  ChangePinDto,
  ChangeUserPasswordDto,
  CreatePinDto,
  TransferDto,
  UpdateAccountDto,
  UploadImageDto,
  VerifyPinDto,
  WithdrawalDto,
} from "../dto";
import {
  axiosClient,
  getClientInfo,
  getRequestQuery,
  hashResourceSync,
  verifyHash,
  sendZohoMailWithTemplate,
  sendAccountDeletedEmail,
  sendPasswordChangedEmail,
  sendPinChangedEmail,
  sendWithdrawalSuccessEmail,
  timeIsAfter,
} from "@/core/utils";
import {
  WITHDRAWAL_MAX_PER_DAY,
  WITHDRAWAL_MAX_UNVERIFIED,
  WITHDRAWAL_MIN_PER_TRANSACTION,
  ZohoMailTemplates,
} from "@/constants";
import { TransactionService } from "@/modules/transactions/transactions.service";
import {
  TransactionEntityType,
  TransactionModeType,
  Transactions,
  TransactionStatusType,
} from "@/modules/transactions/transactions.entity";
import { Transfer } from "@/modules/transfers/transfers.entity";
import {
  generateMasamasaRef,
  capitalizeString,
  generateRandomNumberString,
} from "@/core/helpers";
import { BVNVerificationDto } from "@/modules/global/bank-verification/dto/bvn-verification.dto";
import { BankVerificationService } from "@/modules/global/bank-verification/bank-verification.service";
import {
  Notification,
  NotificationTag,
} from "@/modules/notifications/entities/notification.entity";
import {
  AccessToken,
  AccessTokenType,
} from "@/modules/global/bank-verification/entities/access-token.entity";
import { CronJob } from "@/modules/global/jobs/cron/cron.job";
import { appConfig } from "@/config";
import { CacheService } from "@/modules/global/cache-container/cache-container.service";
import { MixpanelService } from "@/modules/global/mixpanel/mixpanel.service";

@Injectable()
export class UsersService extends BaseService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(AccessToken)
    private readonly accessTokenRepository: Repository<AccessToken>,
    @InjectRepository(Transactions)
    private readonly transactionsRepository: Repository<Transactions>,
    private readonly transactionService: TransactionService,
    private readonly bankVerificationService: BankVerificationService,
    private readonly cronJob: CronJob,
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
    private readonly mixpanel: MixpanelService,
  ) {
    super();
  }
  async getAuthStaff(req: UserRequest) {
    const fetch = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.pin")
      .where("user.id = :id", { id: req.user.id })
      .getOne();
    if (!fetch) throw new UnauthorizedException("User not found, please login");
    const user = {
      ...fetch,
      hasPin: fetch.pin ? true : false,
      // Salted hash — the only user identifier the mobile app may hand to
      // Mixpanel's identify(). The raw id and the salt never leave the server.
      analytics_id: this.mixpanel.hashUserId(fetch.id),
    };
    delete user.pin;
    return user;
  }

  async updateProfile(updateAccountDto: UpdateAccountDto, req: UserRequest) {
    const update = await this.userRepository.update(
      { id: req.user.id },
      {
        phone: updateAccountDto.phone,
        address: updateAccountDto.address,
        first_name: updateAccountDto.first_name,
        last_name: updateAccountDto.last_name,
        city: updateAccountDto.city,
        state: updateAccountDto.state,
        country: updateAccountDto.country,
      },
    );
  }

  async setPin(createPinDto: CreatePinDto, req: UserRequest) {
    if (!createPinDto.pin || !/^\d{4}$/.test(createPinDto.pin)) {
      throw new BadRequestException("Invalid pin, pin must be 4-digit");
    }
    const { user } = req;

    const fetch = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.pin")
      .where("user.id = :id", { id: user.id })
      .getOne();

    if (fetch && fetch.pin) {
      throw new BadRequestException(
        "Pin has already been set, please click on change pin to proceed",
      );
    }

    const save = await this.userRepository.update(
      { id: user.id },
      { pin: hashResourceSync(`${createPinDto.pin}`) },
    );

    return user;
  }

  async requestPinChangeOtp(req: UserRequest) {
    const { user } = req;

    const otp = generateRandomNumberString(6);
    await this.userRepository.update(
      { id: user.id },
      { remember_token: otp, token_created_at: new Date() },
    );

    sendZohoMailWithTemplate(
      {
        to: {
          name: `${capitalizeString(user.first_name)} ${capitalizeString(user.last_name)}`,
          email: user.email,
        },
      },
      {
        subject: "PIN Change Verification Code",
        templateId: ZohoMailTemplates.verify_email,
        variables: {
          firstName: capitalizeString(user.first_name),
          token: otp,
        },
      },
    );

    return { message: "Verification code sent to your email." };
  }

  async changePin(changePinDto: ChangePinDto, req: UserRequest) {
    const { user } = req;
    if (!changePinDto.old_pin) {
      throw new BadRequestException("Old pin is required");
    }
    if (!changePinDto.otp) {
      throw new BadRequestException("Verification code is required");
    }
    const fetch = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.pin")
      .addSelect("user.remember_token")
      .where("user.id = :id", { id: user.id })
      .getOne();
    if (fetch) {
      if (
        fetch.remember_token !== changePinDto.otp ||
        !fetch.token_created_at ||
        timeIsAfter(fetch.token_created_at, 15)
      ) {
        throw new BadRequestException("Invalid or expired verification code.");
      }
      const verified = await verifyHash(changePinDto.old_pin, fetch.pin);
      if (!verified) throw new BadRequestException("Incorrect old pin");
    } else {
      throw new BadRequestException("User not found");
    }

    if (!changePinDto.pin || !/^\d{4}$/.test(changePinDto.pin)) {
      throw new BadRequestException("Invalid new pin, pin must be 4-digit");
    }

    const save = await this.userRepository.update(
      { id: user.id },
      {
        pin: hashResourceSync(`${changePinDto.pin}`),
        remember_token: null,
        token_created_at: null,
      },
    );

    sendPinChangedEmail(fetch);

    return { ...user, hasPin: fetch.pin ? true : false };
  }

  async verifyPin(verifyPinDto: VerifyPinDto, req: UserRequest) {
    const { user } = req;

    if (!verifyPinDto.pin || !/^\d{4}$/.test(verifyPinDto.pin)) {
      throw new BadRequestException("Invalid pin, pin must be 4-digit");
    }

    const fetch = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.pin")
      .where("user.id = :id", { id: user.id })
      .getOne();

    if (!fetch) {
      throw new BadRequestException("User not found");
    }

    if (!fetch.pin) {
      throw new BadRequestException("PIN has not been set");
    }

    const verified = await verifyHash(verifyPinDto.pin, fetch.pin);
    if (!verified) {
      throw new BadRequestException("Incorrect pin");
    }

    return { message: "PIN verified successfully" };
  }

  /**
   * Loads the user with their password hash and validates the supplied
   * old/new password pair. Shared by the OTP request and the final change
   * so both steps enforce identical rules.
   */
  private async validatePasswordChange(
    changeUserPasswordDto: ChangeUserPasswordDto,
    req: UserRequest,
  ) {
    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.password")
      .addSelect("user.remember_token")
      .where("user.id = :id", { id: req.user.id })
      .getOne();

    if (!user) {
      throw new BadRequestException("User not found, please login again");
    }

    const verified = await verifyHash(
      changeUserPasswordDto.old_password,
      user.password,
    );
    if (!verified) throw new BadRequestException("Incorrect current password");

    if (
      changeUserPasswordDto.new_password !=
      changeUserPasswordDto.new_password_confirmation
    ) {
      throw new BadRequestException(
        "New password and confirm password does not match",
      );
    }

    if (changeUserPasswordDto.new_password === changeUserPasswordDto.old_password) {
      throw new BadRequestException(
        "New password must be different from your current password",
      );
    }

    return user;
  }

  /**
   * Step 1 of a password change: validate the details, then email a
   * one-time code. Nothing is changed until the code is verified.
   */
  async requestPasswordChangeOtp(
    changeUserPasswordDto: ChangeUserPasswordDto,
    req: UserRequest,
  ) {
    const user = await this.validatePasswordChange(changeUserPasswordDto, req);

    const otp = generateRandomNumberString(6);
    await this.userRepository.update(
      { id: user.id },
      { remember_token: otp, token_created_at: new Date() },
    );

    sendZohoMailWithTemplate(
      {
        to: {
          name: `${capitalizeString(user.first_name)} ${capitalizeString(user.last_name)}`,
          email: user.email,
        },
      },
      {
        subject: "Password Change Verification Code",
        templateId: ZohoMailTemplates.verify_email,
        variables: {
          firstName: capitalizeString(user.first_name),
          token: otp,
        },
      },
    );

    return { message: "Verification code sent to your email." };
  }

  /**
   * Step 2: re-validate, verify the emailed OTP, then store the new
   * password as a bcrypt hash and confirm by email.
   */
  async changePassword(
    changeUserPasswordDto: ChangeUserPasswordDto,
    req: UserRequest,
  ) {
    if (!changeUserPasswordDto.otp) {
      throw new BadRequestException("Verification code is required");
    }

    const user = await this.validatePasswordChange(changeUserPasswordDto, req);

    if (
      user.remember_token !== changeUserPasswordDto.otp ||
      !user.token_created_at ||
      timeIsAfter(user.token_created_at, 15)
    ) {
      throw new BadRequestException("Invalid or expired verification code.");
    }

    await this.userRepository.update(
      { id: user.id },
      {
        // Must be hashed — storing the raw value would lock the user out,
        // since login compares against a bcrypt hash.
        password: hashResourceSync(changeUserPasswordDto.new_password),
        remember_token: null,
        token_created_at: null,
      },
    );

    sendPasswordChangedEmail(user);

    this.notificationRepository
      .save({
        user_id: user.id,
        message:
          "Your password was changed. If this wasn't you, contact support immediately.",
        tag: NotificationTag.security,
        metadata: {},
      } as unknown as Notification)
      .catch(() => {});

    return { message: "Password changed successfully" };
  }

  async uploadImage(uploadImageDto: UploadImageDto, req: UserRequest) {
    const user = await this.userRepository
      .createQueryBuilder("user")
      .where("user.id = :id", { id: req.user.id })
      .getOne();
    if (!user) throw new BadRequestException("User not found");

    if (uploadImageDto.type == "kyc") {
      if (user.kyc_status == KycStatus.pending) {
        throw new BadRequestException(
          "We are currently verifying your document, you can't upload another document during this period",
        );
      }
      if (user.kyc_status == KycStatus.success) {
        throw new BadRequestException("KYC has already been verified");
      }

      await this.userRepository.update(
        { id: user.id },
        { kyc_image: uploadImageDto.image, kyc_status: KycStatus.pending },
      );
      return { message: "KYC document uploaded successfully" };
    } else if (uploadImageDto.type == "profile_image") {
      await this.userRepository.update(
        { id: user.id },
        { profile_image: uploadImageDto.image },
      );
      return { message: "Profile image uploaded successfully" };
    } else {
      throw new BadRequestException("Invalid document type");
    }
  }

  async walletBalance(req: UserRequest) {
    const { user } = req;
    return this.transactionService.getAccountBalance(user.id);
  }

  // Start of the current calendar day, in the server's timezone. The daily
  // window and the `resetsAt` we hand the client are both derived from this,
  // so what the app displays cannot drift from what is enforced.
  private startOfDay(): Date {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start;
  }

  // Total already withdrawn inside the current day window.
  //
  // Takes an EntityManager so the withdrawal path can run it inside its open
  // transaction (where it must be read under the row lock), while the
  // read-only limits endpoint can pass the default manager.
  private async getWithdrawnToday(
    manager: EntityManager,
    userId: number,
  ): Promise<number> {
    const result = await manager
      .createQueryBuilder(Transactions, "transaction")
      .select("COALESCE(SUM(transaction.amount), 0)", "total")
      .where("transaction.user_id = :user_id", { user_id: userId })
      .andWhere("transaction.entity_type = :entityType", {
        entityType: TransactionEntityType.withdrawal,
      })
      // Pending and processing withdrawals count — that money is already
      // committed, so leaving them out would let the cap be overshot.
      .andWhere("transaction.status IN (:...statuses)", {
        statuses: [
          TransactionStatusType.success,
          TransactionStatusType.processing,
          TransactionStatusType.pending,
        ],
      })
      .andWhere("transaction.created_at >= :startOfDay", {
        startOfDay: this.startOfDay(),
      })
      .getRawOne();

    return parseFloat(result.total) || 0;
  }

  // What the account may still withdraw today. Backs `GET /user/withdrawal-limits`
  // so the app can warn before the user reaches the PIN screen; the authoritative
  // check still runs under the row lock in `withdrawal()`.
  async withdrawalLimits(req: UserRequest) {
    const user = await this.userRepository.findOne({
      where: { id: req.user.id },
    });
    if (!user) {
      throw new UnauthorizedException(
        "Auth user not found, please login again",
      );
    }

    const kycVerified = user.kyc_status == KycStatus.success;
    const maxPerDay = kycVerified
      ? WITHDRAWAL_MAX_PER_DAY
      : WITHDRAWAL_MAX_UNVERIFIED;

    const withdrawnToday = await this.getWithdrawnToday(
      this.dataSource.manager,
      user.id,
    );

    // Clamped at zero: a limit lowered after the fact (or a manual entry)
    // could otherwise report a negative allowance.
    const remainingToday = Math.max(0, maxPerDay - withdrawnToday);

    const resetsAt = this.startOfDay();
    resetsAt.setDate(resetsAt.getDate() + 1);

    return {
      kycVerified,
      maxPerDay,
      minPerTransaction: WITHDRAWAL_MIN_PER_TRANSACTION,
      withdrawnToday,
      remainingToday,
      resetsAt: resetsAt.toISOString(),
    };
  }

  async transfer(transferDto: TransferDto, req: UserRequest) {
    const find = await this.userRepository.findOne({
      where: { email: transferDto.email },
    });
    if (!find) {
      throw new BadRequestException("User with this email was not found");
    }

    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.pin")
      .where("user.id = :user_id", { user_id: req.user.id })
      .getOne();
    if (!user) {
      throw new UnauthorizedException(
        "Auth user not found, please login again",
      );
    }
    if (user.id == find.id) {
      throw new UnauthorizedException("You can't transfer to yourself");
    }

    const verified = await verifyHash(transferDto.pin, user.pin);
    if (!verified) throw new BadRequestException("Incorrect pin");

    delete user.pin;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let trans: Transactions;
    try {
      await queryRunner.manager
        .createQueryBuilder(User, "user")
        .setLock("pessimistic_write")
        .where("user.id = :id", { id: user.id })
        .getOne();

      const balanceResult = await queryRunner.manager
        .createQueryBuilder(Transactions, "transaction")
        .select(
          `
          SUM(CASE WHEN transaction.mode = :credit AND transaction.status = :success THEN transaction.amount ELSE 0 END) -
          SUM(CASE WHEN transaction.mode = :debit AND transaction.status IN (:success, :processing) THEN transaction.amount ELSE 0 END)
        `,
          "balance",
        )
        .where("transaction.user_id = :user_id", { user_id: user.id })
        .setParameters({
          credit: TransactionModeType.credit,
          debit: TransactionModeType.debit,
          success: TransactionStatusType.success,
          processing: TransactionStatusType.processing,
        })
        .getRawOne();

      const balance = parseFloat(balanceResult.balance) || 0;
      if (balance < transferDto.amount) {
        throw new BadRequestException("Insufficient wallet balance");
      }

      const transfer = await queryRunner.manager.save(
        queryRunner.manager.create(Transfer, {
          user_id: user.id,
          receiver_id: find.id,
          amount: transferDto.amount,
        }),
      );

      trans = await queryRunner.manager.save(
        queryRunner.manager.create(Transactions, {
          user_id: user.id,
          network: null,
          coin_amount: 0,
          wallet_address: null,
          mode: TransactionModeType.debit,
          entity_type: TransactionEntityType.transfer,
          metadata: {
            receiver: {
              id: find.id,
              first_name: find.first_name,
              last_name: find.last_name,
              email: find.email,
            },
            client: getClientInfo(req),
          },
          exchange_rate_id: null,
          currency: "NGN",
          entity_id: transfer.id,
          dollar_amount: 0,
          amount: transferDto.amount,
          coin_exchange_rate: 0,
          masamasa_ref: generateMasamasaRef(),
          status: TransactionStatusType.success,
        } as unknown as Transactions),
      );

      await queryRunner.manager.save(
        queryRunner.manager.create(Transactions, {
          user_id: find.id,
          network: null,
          coin_amount: 0,
          wallet_address: null,
          mode: TransactionModeType.credit,
          entity_type: TransactionEntityType.transfer,
          metadata: {
            sender: {
              id: user.id,
              first_name: user.first_name,
              last_name: user.last_name,
              email: user.email,
            },
          },
          exchange_rate_id: null,
          currency: "NGN",
          entity_id: transfer.id,
          dollar_amount: 0,
          amount: transferDto.amount,
          coin_exchange_rate: 0,
          masamasa_ref: generateMasamasaRef(),
          status: TransactionStatusType.success,
        } as unknown as Transactions),
      );

      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }

    return trans;
  }

  // async withdrawWithNombaBank(
  //   accountNumber,
  //   accountName,
  //   bankCode,
  //   bankName,
  //   amount,
  //   narration = ""
  // ) {
  //   var accessToken = await this.accessTokenRepository.findOne({
  //     where: { type: AccessTokenType.nomba },
  //   });

  //   if (!accessToken) {
  //     accessToken = await this.cronJob.generateNombaAccessToken();
  //   }

  //   try {
  //     const res = await axiosClient(
  //       `${appConfig.NOMBA_BASE_URL}/v2/transfers/bank`,
  //       {
  //         method: "POST",
  //         body: {
  //           accountNumber: accountNumber,
  //           bankCode: bankCode,
  //           amount: amount,
  //           accountName: accountName,
  //           merchantTxRef: generateMasamasaRef(),
  //           senderName: "MasaMasa",
  //           narration: narration,
  //         },
  //         headers: {
  //           "Content-Type": "application/json",
  //           Accept: "application/json",
  //           accountId: appConfig.NOMBA_ACCOUNT_ID,
  //           Authorization: `Bearer ${accessToken!.token}`,
  //         },
  //       }
  //     );
  //     console.log("Nomba bank lookup", res);
  //     return {
  //       message: "Account number verified",
  //       data: {
  //         bank_name: bankName,
  //         account_name: res.data.accountName,
  //         account_number: accountNumber,
  //       },
  //     };
  //   } catch (e) {
  //     console.log("Error loop bank details from Nomba:", e);
  //     // // this.monitorService.recordError(e);

  //     throw new BadRequestException(e.response.data.description);
  //   }
  // }

  async withdrawal(withdrawalDto: WithdrawalDto, req: UserRequest) {
    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.pin")
      .where("user.id = :user_id", { user_id: req.user.id })
      .getOne();
    if (!user) {
      throw new UnauthorizedException(
        "Auth user not found, please login again",
      );
    }

    const verified = await verifyHash(withdrawalDto.pin, user.pin);
    if (!verified) throw new BadRequestException("Incorrect pin");

    delete user.pin;

    // Unverified accounts are no longer blocked outright — they withdraw
    // against a lower ceiling until KYC is approved. There is no per-transaction
    // cap on top of this: a single withdrawal may use up the whole day's
    // allowance, and the daily check below is what bounds it.
    const kycVerified = user.kyc_status == KycStatus.success;
    const maxPerDay = kycVerified
      ? WITHDRAWAL_MAX_PER_DAY
      : WITHDRAWAL_MAX_UNVERIFIED;

    // Lock the user row for the duration of the balance check + transaction insert
    // to prevent concurrent withdrawals from racing past the balance check.
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let trans: Transactions;
    try {
      await queryRunner.manager
        .createQueryBuilder(User, "user")
        .setLock("pessimistic_write")
        .where("user.id = :id", { id: user.id })
        .getOne();

      const balanceResult = await queryRunner.manager
        .createQueryBuilder(Transactions, "transaction")
        .select(
          `
          SUM(CASE WHEN transaction.mode = :credit AND transaction.status = :success THEN transaction.amount ELSE 0 END) -
          SUM(CASE WHEN transaction.mode = :debit AND transaction.status IN (:success, :processing) THEN transaction.amount ELSE 0 END)
        `,
          "balance",
        )
        .where("transaction.user_id = :user_id", { user_id: user.id })
        .setParameters({
          credit: TransactionModeType.credit,
          debit: TransactionModeType.debit,
          success: TransactionStatusType.success,
          processing: TransactionStatusType.processing,
        })
        .getRawOne();

      const balance = parseFloat(balanceResult.balance) || 0;
      if (balance < withdrawalDto.amount) {
        throw new BadRequestException("Insufficient wallet balance");
      }

      // Daily cap. Read inside the lock so two concurrent withdrawals cannot
      // each see the same "already withdrawn today" figure and both pass.
      const withdrawnToday = await this.getWithdrawnToday(
        queryRunner.manager,
        user.id,
      );
      const remainingToday = maxPerDay - withdrawnToday;

      if (withdrawalDto.amount > remainingToday) {
        const limit = maxPerDay.toLocaleString("en-NG");
        const upgradeHint = kycVerified
          ? ""
          : " Complete your account verification (KYC) to raise this limit.";

        let message: string;
        if (withdrawnToday <= 0) {
          // Nothing spent yet today, so the cap is the only thing in the way —
          // phrasing it as a "daily" overrun would just confuse.
          message = kycVerified
            ? `The most you can withdraw in a day is NGN ${limit}.`
            : `Unverified accounts can withdraw up to NGN ${limit}.${upgradeHint}`;
        } else if (remainingToday <= 0) {
          message = `You have reached your daily withdrawal limit of NGN ${limit}. Please try again tomorrow.${upgradeHint}`;
        } else {
          message = `This would exceed your daily withdrawal limit of NGN ${limit}. You can still withdraw NGN ${remainingToday.toLocaleString("en-NG")} today.${upgradeHint}`;
        }

        throw new BadRequestException(message);
      }

      trans = await queryRunner.manager.save(
        queryRunner.manager.create(Transactions, {
          user_id: user.id,
          network: null,
          coin_amount: 0,
          wallet_address: null,
          mode: TransactionModeType.debit,
          entity_type: TransactionEntityType.withdrawal,
          metadata: {
            bankCode: withdrawalDto.bankCode,
            accountNumber: withdrawalDto.accountNumber,
            accountName: withdrawalDto.accountName,
            bankName: withdrawalDto.bankName,
            narration: withdrawalDto.narration,
            client: getClientInfo(req),
          },
          exchange_rate_id: null,
          currency: "NGN",
          entity_id: 0,
          dollar_amount: 0,
          amount: withdrawalDto.amount,
          coin_exchange_rate: 0,
          masamasa_ref: generateMasamasaRef(),
          status: TransactionStatusType.processing,
        } as unknown as Transactions),
      );

      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }

    var accessToken = await this.accessTokenRepository.findOne({
      where: { type: AccessTokenType.nomba },
    });

    if (!accessToken) {
      accessToken = await this.cronJob.generateNombaAccessToken();
    }

    try {
      const res = await axiosClient(
        `${appConfig.NOMBA_BASE_URL}/v1/transfers/bank`,
        {
          method: "POST",
          body: {
            accountNumber: trans.metadata.accountNumber,
            bankCode: trans.metadata.bankCode,
            amount: trans.amount,
            accountName: trans.metadata.accountName,
            merchantTxRef: trans.masamasa_ref,
            senderName: "MasaMasa",
            narration: withdrawalDto.narration,
          },
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            accountId: appConfig.NOMBA_ACCOUNT_ID,
            Authorization: `Bearer ${accessToken!.token}`,
          },
        },
      );

      console.log("Nomba bank transfer", res.data);
      if (res.data.status == "SUCCESS") {
        console.log("Nomba transfer initiated successfully");
        await this.transactionsRepository.update(
          { id: trans.id },
          {
            retry: trans.retry + 1,
            session_id: res.data.id,
          },
        );

        // Analytics: bank code only — never the account number (Do Not Send).
        this.mixpanel.track("payout initiated", user.id, {
          "payout id": trans.masamasa_ref,
          "amount ngn": Number(trans.amount) || 0,
          "bank code": withdrawalDto.bankCode,
        });
      } else {
        await this.transactionsRepository.update(
          { id: trans.id },
          {
            status: TransactionStatusType.failed,
            retry: trans.retry + 1,
            metadata: {
              ...trans.metadata,
              error: res.data,
              initiate_resp: res.data,
            },
          },
        );
      }
    } catch (e) {
      const errData = e?.response?.data;
      console.log("Error from Nomba Transfer:", errData ?? e?.message);
      // // this.monitorService.recordError(e);

      // "Insufficient funds" here means OUR Nomba payout account is low —
      // never surface that to the user. The withdrawal stays processing and
      // the verification cron re-initiates it once the account is funded
      // (capped retries, then flagged for manual review).
      const description: string = errData?.description ?? "";
      if (description.toLowerCase().includes("insufficient")) {
        await this.transactionsRepository.update(
          { id: trans.id },
          {
            metadata: {
              ...trans.metadata,
              initiate_error: errData,
              note: "Payout account low — queued for automatic retry",
            },
          },
        );
        return trans;
      }

      throw new BadRequestException(
        description || "Withdrawal could not be initiated, please try again",
      );
    }

    return trans;
  }

  async userKyc(bVNVerificationDto: BVNVerificationDto, req: UserRequest) {
    const { first_name, last_name, id } = req.user;
    const { bvn, dob, gender } = bVNVerificationDto;

    const user = await this.userRepository.findOne({
      where: { id: req.user.id },
    });

    if (!user) {
      throw new BadRequestException("User not found, please login again");
    }
    if (user && user.kyc_status == KycStatus.success)
      return { message: "You are already verified." };

    // Analytics: document TYPE only — never the BVN/NIN value (Do Not Send).
    this.mixpanel.track("kyc submitted", req.user.id, {
      "kyc document type": "bvn",
    });
    this.mixpanel.setProfile(req.user.id, { "kyc status": "pending" });

    try {
      const { data, success } =
        await this.bankVerificationService.bvnVerification(bvn, {
          first_name: user.first_name,
          last_name: user.last_name,
          dob,
          gender,
        });

      if (!success) {
        // Fixed reason codes only — free text is prohibited in payloads.
        this.mixpanel.track("kyc result", req.user.id, {
          "kyc status": "rejected",
          "rejection reason code": !data
            ? "PROVIDER_UNAVAILABLE"
            : "BVN_MISMATCH",
        });
        this.mixpanel.setProfile(req.user.id, { "kyc status": "rejected" });
        if (!data)
          throw new BadRequestException(
            "BVN verification can not be processed at the moment, please try again later",
          );
        throw new BadRequestException(
          "BVN information does not match the user details (first name, last name, date of birth) provided",
        );
      }

      const save = await this.userRepository.update(
        { id: req.user.id },
        { kyc_status: KycStatus.success },
      );

      this.mixpanel.track("kyc result", req.user.id, {
        "kyc status": "verified",
      });
      this.mixpanel.setProfile(req.user.id, {
        "kyc status": "verified",
        "kyc completed date": new Date().toISOString(),
        state: user.state?.toLowerCase(),
      });
      console.log("save", save);
      return {
        message: "KYC verification successful",
        data,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Request account deletion - validates password and stores deletion request
   */
  async requestAccountDeletion(
    password: string,
    reason: string | undefined,
    req: UserRequest,
  ) {
    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.password")
      .where("user.id = :id", { id: req.user.id })
      .getOne();

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    // Verify password
    if (!user.password) {
      throw new BadRequestException(
        "Password authentication not set up for this account",
      );
    }

    const isPasswordValid = await verifyHash(password, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException("Invalid password");
    }

    // Store deletion request in cache (expires in 15 minutes)
    const cacheKey = `account_deletion_${user.id}`;
    await this.cacheService.set(
      cacheKey,
      {
        verified: true,
        reason: reason || "No reason provided",
        requestedAt: new Date().toISOString(),
      },
      900000, // 15 minutes in milliseconds
    );

    return {
      success: true,
      message: "Password verified. Please confirm the deletion to proceed.",
      expiresIn: "15 minutes",
    };
  }

  /**
   * Confirm and execute account deletion with confirmation value (1)
   */
  async confirmAccountDeletion(
    confirmation: number | string,
    req: UserRequest,
  ) {
    const user = await this.userRepository.findOne({
      where: { id: req.user.id },
    });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    // Convert string to number if necessary
    const confirmationNumber =
      typeof confirmation === "string" ? Number(confirmation) : confirmation;

    // Verify confirmation value
    if (confirmation != 1) {
      throw new BadRequestException(
        "Invalid confirmation value. Must be 1 to proceed.",
      );
    }

    // Retrieve deletion request from cache
    const cacheKey = `account_deletion_${user.id}`;
    const cachedData = await this.cacheService.get<{
      verified: boolean;
      reason: string;
      requestedAt: string;
    }>(cacheKey);

    if (!cachedData || !cachedData.verified) {
      throw new BadRequestException(
        "Deletion request has expired or is invalid. Please request account deletion again.",
      );
    }

    // Soft delete the user (sets deleted_at timestamp)
    await this.userRepository.softDelete({ id: user.id });

    // Clear the deletion request from cache
    await this.cacheService.del(cacheKey);

    // Fire-and-forget: the account is already deleted, so a mail failure must
    // not turn a successful deletion into an error response.
    sendAccountDeletedEmail(user, cachedData.reason);

    return {
      success: true,
      message:
        "Your account has been successfully deleted. You will be logged out shortly.",
      deletedAt: new Date(),
    };
  }

  /**
   * Cancel account deletion request
   */
  async cancelAccountDeletion(req: UserRequest) {
    const cacheKey = `account_deletion_${req.user.id}`;
    await this.cacheService.del(cacheKey);

    return {
      success: true,
      message: "Account deletion request has been cancelled.",
    };
  }

  async updateMfa(req: UserRequest) {
    const user = await this.userRepository.findOne({
      where: { id: req.user.id },
    });
    if (!user) throw new UnauthorizedException("User not found");
    const mfa = !user.mfa;
    await this.userRepository.update({ id: req.user.id }, { mfa });
    return { message: `MFA has been ${mfa ? "enabled" : "disabled"}.` };
  }
}
