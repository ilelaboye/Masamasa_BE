import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import type { Response } from "express";
import {
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { AdministratorService } from "../services/administrator.service";
import { _ADMIN_AUTH_COOKIE_NAME_, _AUTH_COOKIE_NAME_ } from "@/constants";
import { AdminAuthGuard } from "@/guards/admin-auth.guard";
import { AdminRequest, SystemCache } from "@/definitions";
import { CacheService } from "@/modules/global/cache-container/cache-container.service";
import { ExchangeRateService } from "@/modules/exchange-rates/exchange-rates.service";
import { CreateExchangeRateDto, DeclineKycDto } from "../dto/admin.dto";
import { PublicService } from "@/modules/global/public/public.service";
import { JoiValidationPipe } from "@/pipes/joi.validation.pipe";
import { CreateUpdateExchangeRateValidation } from "../validations/admin.validation";
import { Web3Service } from "@/modules/web3/web3.service";
import { WithdrawTokenDto } from "@/modules/web3/web3.dto";
import { WithdrawTokenValidation } from "@/modules/web3/web3.validation";

@ApiTags("Admin")
@ApiCookieAuth(_ADMIN_AUTH_COOKIE_NAME_)
@UseGuards(AdminAuthGuard)
@Controller("admin")
export class AdministratorController {
  constructor(
    private readonly administratorService: AdministratorService,
    private readonly cacheService: CacheService,
    private readonly exchangeRateService: ExchangeRateService,
    private readonly web3Service: Web3Service,
  ) {}

  @Get("users")
  async users(@Req() req: AdminRequest) {
    return this.administratorService.getUsers(req);
  }

  @ApiOperation({ summary: "Get a single user details" })
  @Get("user/:id")
  async getUser(@Param("id") id: string, @Req() req: AdminRequest) {
    return await this.administratorService.getUser(+id, req);
  }

  @ApiOperation({ summary: "Get a user transactions" })
  @Get("user/:id/transactions")
  async getUserTransaction(@Param("id") id: string, @Req() req: AdminRequest) {
    return await this.administratorService.getUserTransactions(+id, req);
  }

  @ApiOperation({ summary: "Get dashboard KPI" })
  @Get("dashboard-kpi")
  async getDashboardKPI(@Req() req: AdminRequest) {
    return this.administratorService.getDashboardKPI(req);
  }

  @ApiOperation({ summary: "Get users with pending kyc" })
  @Get("get-pending-kyc")
  async pendingKYC(@Req() req: AdminRequest) {
    return await this.administratorService.getPendingKYC(req);
  }

  @ApiOperation({ summary: "Verify user kyc" })
  @Get("verify-kyc/:id")
  async verifyKyc(@Param("id") id: string, @Req() req: AdminRequest) {
    return this.administratorService.verifyKyc(+id, req);
  }

  @ApiOperation({ summary: "Get exchange rates" })
  @Get("exchange-rates")
  async getExchangeRates(@Req() req: AdminRequest) {
    return this.exchangeRateService.findAll();
  }

  @ApiOperation({ summary: "Decline user kyc" })
  @Post("decline-kyc")
  async declineKyc(
    @Body() declineKycDto: DeclineKycDto,
    @Req() req: AdminRequest,
  ) {
    return this.administratorService.declineKyc(declineKycDto, req);
  }

  @ApiOperation({ summary: "Get a single transaction details" })
  @Get("transaction/:id")
  async transaction(@Param("id") id: string, @Req() req: AdminRequest) {
    return await this.administratorService.transaction(+id, req);
  }

  @ApiOperation({ summary: "Get all transactions" })
  @ApiQuery({
    name: "date_from",
    required: false,
    description: "Filter transaction by date range",
  })
  @ApiQuery({
    name: "date_to",
    required: false,
    description: "Filter transaction by date range",
  })
  @Get("transactions")
  async transactions(@Req() req: AdminRequest) {
    return this.administratorService.transactions(req);
  }

  @Post("create-exchange-rate")
  @UsePipes(new JoiValidationPipe(CreateUpdateExchangeRateValidation))
  async createExchangeRate(
    @Body() createExchangeRateDto: CreateExchangeRateDto,
    @Req() req: AdminRequest,
  ) {
    return this.administratorService.saveExchangeRate(
      createExchangeRateDto,
      req,
    );
  }

  //WEB3 API's
  @Get("web3/balances")
  async getAllBalances() {
    return await this.web3Service.getAllBalances();
  }

  @Post("web3/withdraw-token")
  @UsePipes(new JoiValidationPipe(WithdrawTokenValidation))
  async withdrawToken(@Body() body: WithdrawTokenDto) {
    return await this.web3Service.withdrawToken(body);
  }

  @Delete("logout")
  async logout(@Req() req: AdminRequest, @Res() res: Response) {
    //Clear cache
    Object.keys(SystemCache).forEach((key) => {
      this.cacheService.del(`${SystemCache[key]}_${req.admin.id}`);
    });

    res.clearCookie(_ADMIN_AUTH_COOKIE_NAME_);
    res.json({
      success: true,
      message: "You have been logged out of this session",
    });
  }
}
