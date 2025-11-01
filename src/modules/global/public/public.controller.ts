import { successResponse } from "@/core/utils";
import { JoiValidationPipe } from "@/pipes/joi.validation.pipe";
import { CacheInterceptor } from "@nestjs/cache-manager";
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
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
import { TransactionWebhookDto } from "./dto";
import { ExchangeRateService } from "@/modules/exchange-rates/exchange-rates.service";

@ApiTags("Public Routes")
@Controller()
export class PublicController {
  constructor(
    private readonly publicService: PublicService,
    private readonly exchangeRateService: ExchangeRateService
  ) {}

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

  @Post("webhook/transaction")
  async transaction(@Body() transactionWebhookDto: TransactionWebhookDto) {
    return await this.publicService.transactionWebhook(transactionWebhookDto);
  }

  @Get("prices")
  async prices() {
    return await this.publicService.getPrices();
  }

  @Get("price")
  async price() {
    return await this.publicService.getPrice("ADA");
  }

  @Get("exchange-rates")
  async exchangeRates() {
    return this.exchangeRateService.findAll();
  }

  @Get("active-exchange-rate")
  async activeExchangeRate() {
    return this.exchangeRateService.getActiveRate();
  }
}
