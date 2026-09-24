import { _AUTH_COOKIE_NAME_ } from "@/constants";
import { SystemCache, UserRequest } from "@/definitions";
import { AuthGuard } from "@/guards";
import { CacheService } from "@/modules/global/cache-container/cache-container.service";
import { JoiValidationPipe } from "@/pipes/joi.validation.pipe";
import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import {
  ChangePinDto,
  ChangeUserPasswordDto,
  ConfirmDeleteAccountDto,
  CreatePinDto,
  DeleteAccountDto,
  EditUserDto,
  KycDto,
  TransferDto,
  UpdateAccountDto,
  UploadImageDto,
  VerifyPinDto,
  WithdrawalDto,
} from "../dto";
import { UsersService } from "../services/users.service";
import {
  ChangeUserPasswordValidation,
  KycValidation,
  VerifyPasswordChangeValidation,
  EditUserValidation,
  TransferValidation,
  UpdateAccountValidation,
  UploadImageValidation,
  WithdrawalValidation,
} from "../validations";

@ApiCookieAuth(_AUTH_COOKIE_NAME_)
@UseGuards(AuthGuard)
@ApiTags("User Account")
@Controller("user")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly cacheService: CacheService,
  ) {}

  @Get("profile")
  async auth(@Req() req: UserRequest) {
    return await this.usersService.getAuthStaff(req);
  }

  @Post("create-pin")
  async setPin(@Body() createPinDto: CreatePinDto, @Req() req: UserRequest) {
    return await this.usersService.setPin(createPinDto, req);
  }

  @Post("change-pin/request-otp")
  async requestPinChangeOtp(@Req() req: UserRequest) {
    return await this.usersService.requestPinChangeOtp(req);
  }

  @Post("change-pin")
  async changePin(@Body() changePinDto: ChangePinDto, @Req() req: UserRequest) {
    return await this.usersService.changePin(changePinDto, req);
  }

  // Forgot-PIN flow. No old PIN is required, so `reset-pin` freezes
  // withdrawals and transfers for PIN_RESET_FREEZE_HOURS afterwards.
  @Post("reset-pin/request-otp")
  async requestPinResetOtp(@Req() req: UserRequest) {
    return await this.usersService.requestPinResetOtp(req);
  }

  @Post("reset-pin")
  async resetPin(@Body() changePinDto: ChangePinDto, @Req() req: UserRequest) {
    return await this.usersService.resetPin(changePinDto, req);
  }

  @Post("pin-verification")
  async verifyPin(@Body() verifyPinDto: VerifyPinDto, @Req() req: UserRequest) {
    return await this.usersService.verifyPin(verifyPinDto, req);
  }

  @Post("transfer")
  @UsePipes(new JoiValidationPipe(TransferValidation))
  async transfer(@Body() transferDto: TransferDto, @Req() req: UserRequest) {
    return await this.usersService.transfer(transferDto, req);
  }

  @Post("withdrawal")
  @UsePipes(new JoiValidationPipe(WithdrawalValidation))
  async withdrawal(
    @Body() withdrawalDto: WithdrawalDto,
    @Req() req: UserRequest,
  ) {
    return await this.usersService.withdrawal(withdrawalDto, req);
  }

  @Get("wallet-balance")
  async walletBalance(@Req() req: UserRequest) {
    return await this.usersService.walletBalance(req);
  }

  // How much of today's withdrawal allowance is left. Lets the app warn the
  // user while they are still typing an amount, instead of at the PIN screen.
  @Get("withdrawal-limits")
  async withdrawalLimits(@Req() req: UserRequest) {
    return await this.usersService.withdrawalLimits(req);
  }

  @UsePipes(new JoiValidationPipe(ChangeUserPasswordValidation))
  @Post("change-password/request-otp")
  async requestPasswordChangeOtp(
    @Body() changeUserPasswordDto: ChangeUserPasswordDto,
    @Req() req: UserRequest,
  ) {
    return await this.usersService.requestPasswordChangeOtp(
      changeUserPasswordDto,
      req,
    );
  }

  @UsePipes(new JoiValidationPipe(VerifyPasswordChangeValidation))
  @Post("change-password")
  async changePassword(
    @Body() changeUserPasswordDto: ChangeUserPasswordDto,
    @Req() req: UserRequest,
  ) {
    return await this.usersService.changePassword(changeUserPasswordDto, req);
  }

  @UsePipes(new JoiValidationPipe(UploadImageValidation))
  @Post("upload-image")
  async uploadImage(
    @Body() uploadImageDto: UploadImageDto,
    @Req() req: UserRequest,
  ) {
    return await this.usersService.uploadImage(uploadImageDto, req);
  }

  @UsePipes(new JoiValidationPipe(UpdateAccountValidation))
  @Post("update-profile")
  async updateProfile(
    @Body() updateAccountDto: UpdateAccountDto,
    @Req() req: UserRequest,
  ) {
    return await this.usersService.updateProfile(updateAccountDto, req);
  }

  @Post("kyc")
  @UsePipes(new JoiValidationPipe(KycValidation))
  async kyc(@Body() kycDto: KycDto, @Req() req: UserRequest) {
    return await this.usersService.userKyc(kycDto, req);
  }

  // @Post("email-verification")
  // async emailVerification(@Req() req: UserRequest) {
  //   return await this.staffsService.sendEmailVerification(req);
  // }

  // @Post("resend-email-verification")
  // async resendEmailVerification(@Req() req: UserRequest) {
  //   return await this.staffsService.sendEmailVerification(req, true);
  // }

  @Delete("logout")
  async logout(@Req() req: UserRequest, @Res() res: Response) {
    //Clear cache
    Object.keys(SystemCache).forEach((key) => {
      this.cacheService.del(`${SystemCache[key]}_${req.user.id}`);
    });

    res.clearCookie(_AUTH_COOKIE_NAME_);
    res.json({
      success: true,
      message: "You have been logged out of this session",
    });
  }

  // ====================================
  // ACCOUNT DELETION ENDPOINTS
  // ====================================

  @Post("request-account-deletion")
  @UsePipes(
    new JoiValidationPipe(require("../validations").DeleteAccountValidation),
  )
  async requestAccountDeletion(
    @Body() body: DeleteAccountDto,
    @Req() req: UserRequest,
  ) {
    return await this.usersService.requestAccountDeletion(
      body.password,
      body.reason,
      req,
    );
  }

  @Post("confirm-account-deletion")
  @UsePipes(
    new JoiValidationPipe(
      require("../validations").ConfirmDeleteAccountValidation,
    ),
  )
  async confirmAccountDeletion(
    @Body() body: ConfirmDeleteAccountDto,
    @Req() req: UserRequest,
  ) {
    return await this.usersService.confirmAccountDeletion(
      body.confirmation,
      req,
    );
  }

  @Post("cancel-account-deletion")
  async cancelAccountDeletion(@Req() req: UserRequest) {
    return await this.usersService.cancelAccountDeletion(req);
  }

  @Post("mfa")
  async updateMfa(@Req() req: UserRequest) {
    return await this.usersService.updateMfa(req);
  }
}
