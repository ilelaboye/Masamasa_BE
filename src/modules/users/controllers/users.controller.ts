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
  CreatePinDto,
  EditUserDto,
  TransferDto,
  UploadImageDto,
  WithdrawalDto,
} from "../dto";
import { UsersService } from "../services/users.service";
import {
  ChangeUserPasswordValidation,
  EditUserValidation,
  TransferValidation,
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
    private readonly cacheService: CacheService
  ) {}

  @Get("profile")
  async auth(@Req() req: UserRequest) {
    return await this.usersService.getAuthStaff(req);
  }

  @Post("create-pin")
  async setPin(@Body() createPinDto: CreatePinDto, @Req() req: UserRequest) {
    return await this.usersService.setPin(createPinDto, req);
  }

  @Post("change-pin")
  async changePin(@Body() changePinDto: ChangePinDto, @Req() req: UserRequest) {
    return await this.usersService.changePin(changePinDto, req);
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
    @Req() req: UserRequest
  ) {
    return await this.usersService.withdrawal(withdrawalDto, req);
  }

  @Get("wallet-balance")
  async walletBalance(@Req() req: UserRequest) {
    return await this.usersService.walletBalance(req);
  }

  @UsePipes(new JoiValidationPipe(ChangeUserPasswordValidation))
  @Post("change-password")
  async changePassword(
    @Body() changeUserPasswordDto: ChangeUserPasswordDto,
    @Req() req: UserRequest
  ) {
    return await this.usersService.changePassword(changeUserPasswordDto, req);
  }

  @UsePipes(new JoiValidationPipe(UploadImageValidation))
  @Post("upload-image")
  async uploadImage(
    @Body() uploadImageDto: UploadImageDto,
    @Req() req: UserRequest
  ) {
    return await this.usersService.uploadImage(uploadImageDto, req);
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
}
