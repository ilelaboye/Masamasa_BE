import { _AUTH_COOKIE_NAME_, CookieOptions } from "@/constants";
import { encryptData, extractUserForCookie } from "@/core/utils";
import type { UserRequest } from "@/definitions";
import { JoiValidationPipe } from "@/pipes/joi.validation.pipe";
import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import {
  ConfirmUserEmailDto,
  CreateAccountDto,
  ForgotPasswordDto,
  LoginStaffDto,
  ResetPasswordDto,
  VerifyTokenDto,
} from "../dto";
import { AuthService } from "../services/auth.service";
import { UserLoginGuard } from "../user-guards";
import {
  ConfirmUserEmailValidation,
  CreateAccountValidation,
  ForgotPasswordValidation,
  LoginValidation,
  ResetPasswordValidation,
} from "../validations";

@ApiTags("User Authentication")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UsePipes(new JoiValidationPipe(LoginValidation))
  @UseGuards(UserLoginGuard)
  @Post("login")
  async login(
    @Body() loginStaffDto: LoginStaffDto,
    @Req() req: UserRequest,
    @Res({ passthrough: true }) res: Response
  ) {
    res.clearCookie(_AUTH_COOKIE_NAME_);

    const { token, user } = await this.authService.login(loginStaffDto, req);

    if (!token || !user) {
      res.status(HttpStatus.NOT_ACCEPTABLE).json({
        success: false,
        message: "Authentication failed, please try again",
      });
    }
    const cookieData = { token, user: extractUserForCookie(user) };
    res.cookie(
      _AUTH_COOKIE_NAME_,
      encodeURIComponent(JSON.stringify(cookieData)),
      CookieOptions
    );

    return {
      data: user,
    };
  }

  @UsePipes(new JoiValidationPipe(CreateAccountValidation))
  @Post("create-account")
  async createAccount(
    @Body() createAccountDto: CreateAccountDto,
    @Res({ passthrough: true }) res: Response
  ) {
    res.clearCookie(_AUTH_COOKIE_NAME_);

    const { data, message } =
      await this.authService.createAccount(createAccountDto);
    const { user } = data;

    if (!user) {
      res.status(HttpStatus.NOT_ACCEPTABLE).json({
        success: false,
        message: "Authentication failed, please login to continue",
      });
    }

    return {
      message,
      data: data,
    };
  }

  @UsePipes(new JoiValidationPipe(ConfirmUserEmailValidation))
  @Post("confirm-email")
  async confirmEmailVerification(@Body() VerifyTokenDto: VerifyTokenDto) {
    return await this.authService.verifyToken(VerifyTokenDto);
  }

  @Post("forgot-password")
  @UsePipes(new JoiValidationPipe(ForgotPasswordValidation))
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return await this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post("resend-forgot-password")
  @UsePipes(new JoiValidationPipe(ForgotPasswordValidation))
  async resendForgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return await this.authService.forgotPassword(forgotPasswordDto, true);
  }

  @Post("reset-password")
  @UsePipes(new JoiValidationPipe(ResetPasswordValidation))
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return await this.authService.resetPassword(resetPasswordDto);
  }
}
