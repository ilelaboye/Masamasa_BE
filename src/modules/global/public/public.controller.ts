import { successResponse } from "@/core/utils";
import { JoiValidationPipe } from "@/pipes/joi.validation.pipe";
import { CacheInterceptor } from "@nestjs/cache-manager";
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseInterceptors,
  UsePipes,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import { PublicService } from "./public.service";
import {
  ActionOnStaffInviteValidation,
  // ConfirmUserEmailValidation,
} from "./validations";

@ApiTags("Public Routes")
@Controller()
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  // @UsePipes(new JoiValidationPipe(ConfirmUserEmailValidation))
  // @Post("auth/confirm-email")
  // async confirmEmailVerification(
  //   @Body() confirmUserEmailDto: ConfirmUserEmailDto,
  //   @Res() res: Response
  // ) {
  //   const response =
  //     await this.publicService.confirmUserEmail(confirmUserEmailDto);
  //   successResponse(res, response);
  // }
}
