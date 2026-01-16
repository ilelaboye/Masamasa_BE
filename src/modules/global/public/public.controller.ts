import { successResponse, verifyNombaWebhook } from "@/core/utils";
import { JoiValidationPipe } from "@/pipes/joi.validation.pipe";
import { CacheInterceptor } from "@nestjs/cache-manager";
import {
  Body,
  Headers,
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
  BankAccountVerificationValidation,
  // ConfirmUserEmailValidation,
} from "./validations";
import { BankAccountVerificationDto, TransactionWebhookDto } from "./dto";
import { ExchangeRateService } from "@/modules/exchange-rates/exchange-rates.service";
import { CreateWalletValidation } from "@/modules/wallet/wallet.validation";
import { CreateWalletDto } from "@/modules/wallet/wallet.dto";

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

  // move this out of here
  // @UsePipes(new JoiValidationPipe(CreateWalletValidation))
  // @Post("wallet/create")
  // async create(@Body() createWalletDto: CreateWalletDto) {
  //   return await this.publicService.saveWalletAddress(createWalletDto);
  // }

  @Post("webhook/flutterwave/transfer")
  async flutterwaveTransferWebhook(@Body() webhook) {
    console.log("FLUTTERWAVE TRANSFER WEBHOOK", webhook);
    return await this.publicService.flutterwaveTransferWebhook(webhook);
  }

  @Post("webhook/nomba/transfer")
  async nombaTransferWebhook(
    @Body() webhook,
    @Headers("nomba-signature") signature: string,
    @Headers("nomba-sig-value") sigValue: string,
    @Headers("nomba-signature-algorithm") algorithm: string,
    @Headers("nomba-signature-version") version: string,
    @Headers("nomba-timestamp") timestamp: string
  ) {
    // MASA3GNKTdmJsv001768505755079
    console.log("NOMBA TRANSFER WEBHOOK", webhook);
    console.log("NOMBA TRANSFER WEBHOOK signature", signature);
    console.log("NOMBA TRANSFER WEBHOOK sigValue", sigValue);
    console.log("NOMBA TRANSFER WEBHOOK algorithm", algorithm);
    console.log("NOMBA TRANSFER WEBHOOK version", version);
    console.log("NOMBA TRANSFER WEBHOOK timestamp", timestamp);
    verifyNombaWebhook(webhook, signature, timestamp);
    return await this.publicService.nombaTransferWebhook(webhook);
  }

  @Post("webhook/transaction")
  async transaction(@Body() transactionWebhookDto: TransactionWebhookDto) {
    return await this.publicService.transactionWebhook(transactionWebhookDto);
  }

  @Get("banks")
  async banks() {
    return await this.publicService.getBanks();
  }

  @UsePipes(new JoiValidationPipe(BankAccountVerificationValidation))
  @Post("bank-verification/verify-account-details")
  async verifyAccountNumber(
    @Body() bankAccountVerificationDto: BankAccountVerificationDto
  ) {
    return await this.publicService.verifyAccountNumber(
      bankAccountVerificationDto
    );
  }

  @Get("prices")
  async prices() {
    return await this.publicService.getPrices();
  }

  @Get("price")
  async price() {
    return await this.publicService.getPrice("SOL");
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
