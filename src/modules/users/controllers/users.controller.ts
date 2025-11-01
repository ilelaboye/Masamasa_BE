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
import { ChangeUserPasswordDto, CreatePinDto, EditUserDto } from "../dto";
import { UsersService } from "../services/users.service";
import {
  ChangeUserPasswordValidation,
  EditUserValidation,
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

  // @UsePipes(new JoiValidationPipe(EditUserValidation))
  // @Post("profile")
  // async edit(@Body() editUserDto: EditUserDto, @Req() req: UserRequest) {
  //   return await this.staffsService.editUser(editUserDto, req);
  // }

  @UsePipes(new JoiValidationPipe(ChangeUserPasswordValidation))
  @Post("change-password")
  async changePassword(
    @Body() changeUserPasswordDto: ChangeUserPasswordDto,
    @Req() req: UserRequest
  ) {
    return await this.usersService.changePassword(changeUserPasswordDto, req);
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
