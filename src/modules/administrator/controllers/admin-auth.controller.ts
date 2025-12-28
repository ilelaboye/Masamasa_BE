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
import { AdminAuthService } from "../services/admin-auth.service";
import {
  _ADMIN_AUTH_COOKIE_NAME_,
  _AUTH_COOKIE_NAME_,
  CookieOptions,
} from "@/constants";
import { extractAdminForCookie } from "@/core/utils";
import { AdminRequest } from "@/definitions";
import { JoiValidationPipe } from "@/pipes/joi.validation.pipe";
import { AdminLoginDto } from "../dto";
import { AdminLoginGuard } from "../guards/admin-login.guard";
import { LoginValidation } from "../validations";
import type { Response } from "express";

@ApiTags("Admin")
@Controller("admin/auth")
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @UsePipes(new JoiValidationPipe(LoginValidation))
  @UseGuards(AdminLoginGuard)
  @Post("login")
  async login(
    @Body() adminLoginDto: AdminLoginDto,
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.clearCookie(_ADMIN_AUTH_COOKIE_NAME_);

    const { token, user } = await this.adminAuthService.login(
      adminLoginDto,
      req,
    );

    if (!token || !user) {
      res.status(HttpStatus.NOT_ACCEPTABLE).json({
        success: false,
        message: "Authentication failed, please try again",
      });
    }

    const cookieData = { token, admin: extractAdminForCookie(user) };
    res.cookie(
      _ADMIN_AUTH_COOKIE_NAME_,
      encodeURIComponent(JSON.stringify(cookieData)),
      CookieOptions,
    );

    return { data: { ...user } };
  }
}
