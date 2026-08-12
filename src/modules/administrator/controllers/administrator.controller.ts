import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { AnalyticsService } from "../services/analytics.service";
import { _ADMIN_AUTH_COOKIE_NAME_, _AUTH_COOKIE_NAME_ } from "@/constants";
import { AdminAuthGuard } from "@/guards/admin-auth.guard";
import { AdminRequest, SystemCache } from "@/definitions";
import { CacheService } from "@/modules/global/cache-container/cache-container.service";
import { ExchangeRateService } from "@/modules/exchange-rates/exchange-rates.service";
import {
  BroadcastNotificationDto,
  ChangeAdminPasswordDto,
  CreateExchangeRateDto,
  DeclineKycDto,
  UpdateAdminProfileDto,
} from "../dto/admin.dto";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import { BroadcastNotificationValidation } from "../validations/admin.validation";
import { PublicService } from "@/modules/global/public/public.service";
import { JoiValidationPipe } from "@/pipes/joi.validation.pipe";
import {
  ChangeAdminPasswordValidation,
  CreateUpdateExchangeRateValidation,
  UpdateAdminProfileValidation,
  UpdateUserStatusValidation,
} from "../validations/admin.validation";
import { Status } from "@/modules/users/entities/user.entity";
import { Web3Service } from "@/modules/web3/web3.service";
import { WithdrawTokenDto } from "@/modules/web3/web3.dto";
import { WithdrawTokenValidation } from "@/modules/web3/web3.validation";
import { QuidaxService } from "@/modules/quidax/quidax.service";

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
    private readonly quidaxService: QuidaxService,
    private readonly notificationsService: NotificationsService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @ApiOperation({ summary: "Get the currently logged-in admin's profile" })
  @Get("profile")
  async profile(@Req() req: AdminRequest) {
    return this.administratorService.getProfile(req);
  }

  @ApiOperation({ summary: "Update the currently logged-in admin's profile" })
  @UsePipes(new JoiValidationPipe(UpdateAdminProfileValidation))
  @Patch("profile")
  async updateProfile(
    @Body() updateAdminProfileDto: UpdateAdminProfileDto,
    @Req() req: AdminRequest,
  ) {
    return this.administratorService.updateProfile(updateAdminProfileDto, req);
  }

  @ApiOperation({ summary: "Change the currently logged-in admin's password" })
  @UsePipes(new JoiValidationPipe(ChangeAdminPasswordValidation))
  @Post("change-password")
  async changePassword(
    @Body() changeAdminPasswordDto: ChangeAdminPasswordDto,
    @Req() req: AdminRequest,
  ) {
    return this.administratorService.changePassword(
      changeAdminPasswordDto,
      req,
    );
  }

  @Get("users")
  async users(@Req() req: AdminRequest) {
    return this.administratorService.getUsers(req);
  }

  @ApiOperation({ summary: "List all Quidax sub-accounts" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "per_page", required: false, type: Number })
  @Get("quidax/sub-accounts")
  async quidaxSubAccounts(
    @Query("page") page?: string,
    @Query("per_page") perPage?: string,
  ) {
    return this.quidaxService.listSubAccounts(
      page ? parseInt(page, 10) : 1,
      perPage ? parseInt(perPage, 10) : 20,
    );
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

  @ApiOperation({ summary: "Analytics: overview headline numbers" })
  @Get("analytics/overview")
  async analyticsOverview() {
    return await this.analyticsService.overview();
  }

  @ApiOperation({ summary: "Analytics: transactions per user for a period" })
  @ApiQuery({
    name: "period",
    required: false,
    enum: ["today", "week", "month", "year"],
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @Get("analytics/transactions-per-user")
  async analyticsTransactionsPerUser(
    @Query("period") period?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    const validPeriods = ["today", "week", "month", "year"] as const;
    const p = validPeriods.includes(period as any)
      ? (period as (typeof validPeriods)[number])
      : "today";
    return await this.analyticsService.transactionsPerUser(
      p,
      Math.max(1, parseInt(page ?? "1", 10) || 1),
      Math.min(100, parseInt(limit ?? "20", 10) || 20),
    );
  }

  @ApiOperation({ summary: "Analytics: transaction volume time series" })
  @ApiQuery({
    name: "granularity",
    required: false,
    enum: ["daily", "weekly", "monthly", "yearly"],
  })
  @Get("analytics/volume")
  async analyticsVolume(@Query("granularity") granularity?: string) {
    const valid = ["daily", "weekly", "monthly", "yearly"] as const;
    const g = valid.includes(granularity as any)
      ? (granularity as (typeof valid)[number])
      : "weekly";
    return await this.analyticsService.volumeSeries(g);
  }

  @ApiOperation({ summary: "Analytics: daily active users and signups" })
  @ApiQuery({ name: "days", required: false, type: Number })
  @Get("analytics/daily-users")
  async analyticsDailyUsers(@Query("days") days?: string) {
    const d = Math.min(365, Math.max(7, parseInt(days ?? "30", 10) || 30));
    return await this.analyticsService.dailyUsers(d);
  }

  @ApiOperation({ summary: "Analytics: registration → KYC funnel" })
  @Get("analytics/kyc-funnel")
  async analyticsKycFunnel() {
    return await this.analyticsService.kycFunnel();
  }

  @ApiOperation({ summary: "Analytics: user & volume locations" })
  @Get("analytics/locations")
  async analyticsLocations() {
    return await this.analyticsService.userLocations();
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

  @ApiOperation({ summary: "Activate or deactivate a user account" })
  @Patch("user/:id/status")
  async updateUserStatus(
    @Param("id") id: string,
    // Pipe scoped to the body — a method-level @UsePipes would also run the
    // object schema against the :id param and reject it.
    @Body(new JoiValidationPipe(UpdateUserStatusValidation))
    body: { status: "active" | "deactivated" },
    @Req() req: AdminRequest,
  ) {
    return await this.administratorService.updateUserStatus(
      +id,
      body.status as Status.active | Status.deactivated,
      req,
    );
  }

  @ApiOperation({ summary: "List notifications broadcast to users" })
  @Get("notifications")
  async listBroadcastNotifications() {
    return await this.notificationsService.listBroadcasts();
  }

  @ApiOperation({ summary: "Send a custom notification to all users" })
  @Post("notifications/broadcast")
  @UsePipes(new JoiValidationPipe(BroadcastNotificationValidation))
  async broadcastNotification(
    @Body() body: BroadcastNotificationDto,
    @Req() req: AdminRequest,
  ) {
    return await this.notificationsService.broadcastToAll(
      body.message,
      req.admin.id,
    );
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

  @Get("withdrawal-wallets")
  async withdrawalWallets(@Req() req: AdminRequest) {
    return this.administratorService.withdrawalWallets(req);
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
  async withdrawToken(
    @Body() body: WithdrawTokenDto,
    @Req() req: AdminRequest,
  ) {
    return await this.web3Service.withdrawToken(body, req);
  }

  @ApiOperation({
    summary: "Get withdrawal history from blockchain for master wallet",
  })
  @Get("withdraw/history")
  async getWithdrawHistory(@Req() req: AdminRequest) {
    return await this.web3Service.getWithdrawHistory();
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
