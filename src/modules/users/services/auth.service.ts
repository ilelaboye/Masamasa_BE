import { appConfig } from "@/config";
import {
  _THROTTLE_TTL_,
  MAILJETTemplates,
  ZohoMailTemplates,
} from "@/constants";
import {
  capitalizeString,
  generateAlphaNumericString,
  generateRandomNumberString,
} from "@/core/helpers";
import {
  getUserCookieData,
  hashResource,
  hashResourceSync,
  sendMailJetWithTemplate,
  sendZohoMailWithTemplate,
  verifyHash,
} from "@/core/utils";
import { type UserRequest } from "@/definitions";
import { toAppNetwork } from "@/modules/quidax/quidax.constants";
import {
  Status as WalletStatus,
  Wallet,
  WalletType,
} from "@/modules/wallet/wallet.entity";
import { BaseService } from "@/modules/base.service";
import {
  BadRequestException,
  Injectable,
  NotAcceptableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";
import {
  CreateAccountDto,
  ForgotPasswordDto,
  LoginStaffDto,
  ResetPasswordDto,
  VerifyTokenDto,
} from "../dto";
import { CacheService } from "@/modules/global/cache-container/cache-container.service";
import { QuidaxService } from "@/modules/quidax/quidax.service";
import { User, Status, TokenType } from "../entities/user.entity";

@Injectable()
export class AuthService extends BaseService {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly cacheService: CacheService,
    private readonly quidaxService: QuidaxService,
  ) {
    super();
  }

  async login(loginStaffDto: LoginStaffDto, req: UserRequest) {
    // const user = await this.userRepository.findOne({
    //   where: { email: loginStaffDto.email },
    // });

    if (loginStaffDto.google_id) {
      const fetch = await this.userRepository
        .createQueryBuilder("user")
        .addSelect("user.password")
        .addSelect("user.pin")
        .where("user.email = :email", {
          email: loginStaffDto.email.toLowerCase(),
        })
        .andWhere("user.google_id = :google_id", {
          google_id: loginStaffDto.google_id,
        })
        .getOne();
    }

    const fetch = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.password")
      .addSelect("user.pin")
      .addSelect("user.google_id")
      .where("user.email = :email", {
        email: loginStaffDto.email.toLowerCase(),
      })
      .getOne();
    console.log("fetch", fetch);

    if (!fetch) {
      throw new NotAcceptableException(
        "User with this login details was not found, please try again",
      );
    }
    // if(loginStaffDto.google_id ){
    // if user does not have google id but is trying to login with google id, save the google ID
    if (!fetch.google_id && loginStaffDto.google_id) {
      await this.userRepository.update(
        { id: fetch.id },
        { google_id: loginStaffDto.google_id },
      );
    } else if (fetch.google_id && loginStaffDto.google_id) {
      if (fetch.google_id !== loginStaffDto.google_id) {
        throw new NotAcceptableException(
          "Google mail does not match our records, please try again",
        );
      }
    } else {
      const verified = await verifyHash(loginStaffDto.password, fetch.password);
      if (!verified)
        throw new NotAcceptableException(
          "Incorrect details given, please try again",
        );
    }

    delete fetch.password;
    let device_id = fetch?.device_id;
    let notification_token = fetch?.notification_token;

    if (loginStaffDto.device_id) device_id = loginStaffDto.device_id;
    if (loginStaffDto.notification_token)
      notification_token = loginStaffDto.notification_token;

    await this.userRepository.update(
      { id: fetch.id },
      { device_id, notification_token },
    );

    const user = {
      ...fetch,
      device_id,
      notification_token,
      hasPin: fetch.pin ? true : false,
    };
    delete user.pin;

    if (!user.email_verified_at) {
      throw new BadRequestException(
        "Email address not verified. Please verify your email to proceed.",
      );
    }

    console.log("User login", user);

    const token = this.jwtService.sign({ ...user });

    return { user, token };
  }

  async verifyToken(verifyEmailTokenDto: VerifyTokenDto) {
    const { email, token, type } = verifyEmailTokenDto;
    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.remember_token")
      .where("user.email = :email", { email: email.toLowerCase() })
      .getOne();
    if (!user) {
      throw new BadRequestException("User with this email does not exist.");
    }

    if (type == TokenType.email_verification && user.email_verified_at) {
      throw new BadRequestException("This user has already been verified.");
    }

    if (
      type != TokenType.email_verification &&
      type != TokenType.forgot_password
    ) {
      throw new BadRequestException("Invalid token type provided.");
    }

    if (user.remember_token !== token) {
      throw new BadRequestException("Invalid verification token provided.");
    }

    if (type == TokenType.email_verification) {
      await this.userRepository.update(
        { email: email.toLowerCase() },
        { email_verified_at: new Date(), remember_token: null },
      );
    }

    return { message: "Verification successful." };
  }

  async resendVerificationToken(emailData: string) {
    const email = emailData.toLowerCase();
    const user = await this.userRepository.findOne({
      where: { email },
    });
    if (!user) {
      throw new BadRequestException("User with this email does not exist.");
    }
    if (user.email_verified_at) {
      throw new BadRequestException("This user has already been verified.");
    }

    const rememberToken = generateRandomNumberString(6);
    await this.userRepository.update(
      { email },
      { remember_token: rememberToken },
    );

    return { message: "Verification token sent successful." };
  }

  async createAccount(createAccountDto: CreateAccountDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    await queryRunner.startTransaction();
    try {
      const {
        email: emailData,
        first_name,
        last_name,
        phone,
        country,
        google_id,
      } = createAccountDto;

      const email = emailData.toLowerCase();

      console.log("phone", phone);
      const existingUser = await this.userRepository.exists({
        where: [{ email: email }],
      });

      if (existingUser) {
        throw new BadRequestException("User with this email already exist.");
      }

      if (phone && phone.length > 0) {
        const existingPhone = await this.userRepository.exists({
          where: [{ email: email }, { phone }],
        });
        if (existingPhone) {
          throw new BadRequestException(
            "User with this phone number already exist.",
          );
        }
      }

      const rememberToken = generateRandomNumberString(6);
      const user = await queryRunner.manager.save(User, {
        first_name: first_name.toLowerCase(),
        last_name: last_name.toLowerCase(),
        email: email.toLowerCase(),
        phone: phone ? phone.toLowerCase() : null,
        country: country.toLowerCase(),
        remember_token: google_id ? null : rememberToken,
        password: hashResourceSync(createAccountDto.password),
        status: Status.active,
        google_id: google_id,
        email_verified_at: google_id ? new Date() : null,
      });

      await queryRunner.commitTransaction();

      // Non-blocking — Quidax account + wallet addresses are provisioned
      // after the DB commit so a slow/failing API never blocks registration.
      this.setupQuidaxAccount(user).catch(() => {});

      const userData = {
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
        country: user.country,
      };

      if (!google_id) {
        sendZohoMailWithTemplate(
          {
            to: {
              name: `${capitalizeString(user.first_name)} ${capitalizeString(user.last_name)}`,
              email,
            },
          },
          {
            subject: "Verification Code",
            templateId: ZohoMailTemplates.verify_email,
            variables: {
              firstName: capitalizeString(user.first_name),
              token: rememberToken,
            },
          },
        );
        // sendMailJetWithTemplate(
        //   {
        //     to: {
        //       name: `${capitalizeString(user.first_name)} ${capitalizeString(user.last_name)}`,
        //       email,
        //     },
        //   },
        //   {
        //     subject: "Verification Code",
        //     templateId: MAILJETTemplates.verify_email,
        //     variables: {
        //       firstName: capitalizeString(user.first_name),
        //       token: rememberToken,
        //     },
        //   }
        // );
      }

      const data = {
        user: userData,
      };

      return { message: "Account creation successful.", data };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async forgotPassword({ email }: ForgotPasswordDto, resend = false) {
    const user = await this.userRepository.findOne({
      where: { email: email.toLowerCase() },
    });
    if (!user)
      throw new NotAcceptableException(
        "Email provided is not recognized, please try again",
      );

    //Check if sent less than 5mins ago
    // if (await this.cacheService.get(`${user.email}_forgot_password`))
    //   throw new BadRequestException(
    //     "Please wait for about 5 minutes to request for another code"
    //   );

    const remember_token = generateRandomNumberString(6);
    this.userRepository.update(
      { email: email.toLowerCase() },
      { remember_token },
    );

    sendZohoMailWithTemplate(
      {
        to: {
          name: `${capitalizeString(user.first_name)} ${capitalizeString(user.last_name)}`,
          email,
        },
      },
      {
        subject: "Forgot Password",
        templateId: ZohoMailTemplates.forgot_password,
        variables: {
          firstName: capitalizeString(user.first_name),
          token: remember_token,
        },
      },
    );

    // sendMailJetWithTemplate(
    //   {
    //     to: {
    //       name: `${capitalizeString(user.first_name)} ${capitalizeString(user.last_name)}`,
    //       email,
    //     },
    //   },
    //   {
    //     subject: "Forgot Password",
    //     templateId: MAILJETTemplates.verify_email,
    //     variables: {
    //       firstName: capitalizeString(user.first_name),
    //       token: remember_token,
    //     },
    //   }
    // );

    //Save in redis
    this.cacheService.set(
      `${user.email}_forgot_password`,
      remember_token,
      _THROTTLE_TTL_,
    );

    return {
      message: resend
        ? "Check your email account to continue. Please check your spam if not received on time."
        : "Verification code has been sent to your email, Please check your spam if not received on time",
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const {
      email: emailData,
      password,
      token,
      password_confirmation,
    } = resetPasswordDto;
    var email = emailData.toLowerCase();
    const user = await this.userRepository
      .createQueryBuilder("user")
      .addSelect("user.remember_token")
      .where("user.email = :email", { email })
      .getOne();
    if (!user)
      throw new NotAcceptableException(
        "Invalid email and token, please try again.",
      );

    if (user.remember_token != token) {
      throw new NotAcceptableException(
        "Incorrect token, please request for another one.",
      );
    }

    if (password != password_confirmation) {
      throw new NotAcceptableException(
        "Password and confirm password does not match",
      );
    }

    await this.userRepository.update(
      { id: user.id },
      { password: await hashResource(password), remember_token: null },
    );
    const { first_name, last_name, id } = user;

    // sendMailJetWithTemplate(
    //   {
    //     to: {
    //       name: `${first_name.toUpperCase()} ${last_name.toUpperCase()}`,
    //       email,
    //     },
    //   },
    //   {
    //     subject: "PASSWORD RESET SUCCESSFULLY.",
    //     templateId: MAILJETTemplates.password_request_success,
    //     variables: {
    //       firstName: capitalizeString(first_name),
    //       link: encodeURI(`${appConfig.APP_FRONTEND}/login`),
    //     },
    //   }
    // );

    // this.userRepository.update({ id }, { remember_token: null });
    return { message: "Password reset successfully." };
  }

  private async setupQuidaxAccount(user: User): Promise<void> {
    const quidaxUser = await this.quidaxService.createSubAccount({
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
    });
    await this.userRepository.update(
      { id: user.id },
      { quidax_id: quidaxUser.id },
    );

    const { addresses, unsupported } =
      await this.quidaxService.createAllPaymentAddresses(quidaxUser.id);

    await Promise.allSettled(
      addresses.map(async (addr) => {
        const appNetwork = toAppNetwork(addr.network, addr.currency);
        const exists = await this.walletRepository.findOne({
          where: {
            user_id: user.id,
            network: appNetwork,
            currency: addr.currency,
          },
        });
        if (exists) return;
        if (!addr.address) return;
        await this.walletRepository.save({
          user_id: user.id,
          currency: addr.currency,
          network: appNetwork,
          wallet_address: addr.address,
          status: WalletStatus.active,
          type: WalletType.quidax,
        });
      }),
    );

    if (unsupported.length === 0) return;

    // Unsupported pairs are all EVM-compatible (BEP-20, Base, Polygon);
    // they share the same HD-derived address as the user's ETH/BSC/Base wallets.
    const evmWallet = await this.walletRepository.findOne({
      where: {
        user_id: user.id,
        network: In(["ETHEREUM", "BINANCE", "BASE"]),
        type: WalletType.quidax,
      },
    });
    if (!evmWallet) return;

    await Promise.allSettled(
      unsupported.map(async ({ currency, network }) => {
        const appNetwork = toAppNetwork(network ?? null, currency);
        const exists = await this.walletRepository.findOne({
          where: { user_id: user.id, network: appNetwork, currency },
        });
        if (exists) return;
        await this.walletRepository.save({
          user_id: user.id,
          currency,
          network: appNetwork,
          wallet_address: evmWallet.wallet_address,
          status: WalletStatus.active,
          type: WalletType.self_custodian,
        });
      }),
    );
  }
}
