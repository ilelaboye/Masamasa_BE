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
import {
  _ADMIN_AUTH_COOKIE_NAME_,
  _AUTH_COOKIE_NAME_,
  ClearCookieOptions,
} from "@/constants";
import { AdminAuthGuard } from "@/guards/admin-auth.guard";
import { AdminRequest, SystemCache } from "@/definitions";
import { CacheService } from "@/modules/global/cache-container/cache-container.service";
import { ExchangeRateService } from "@/modules/exchange-rates/exchange-rates.service";
import {
  BroadcastNotificationDto,
  ChangeAdminPasswordDto,
  CreateExchangeRateDto,
  CreateStaffDto,
  DeclineKycDto,
  UpdateAdminProfileDto,
  UpdateStaffStatusDto,
} from "../dto/admin.dto";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import { BroadcastNotificationValidation } from "../validations/admin.validation";
import { PublicService } from "@/modules/global/public/public.service";
import { JoiValidationPipe } from "@/pipes/joi.validation.pipe";
import {
  ChangeAdminPasswordValidation,
  CreateStaffValidation,
  CreateUpdateExchangeRateValidation,
  UpdateAdminProfileValidation,
  UpdateStaffStatusValidation,
  UpdateUserStatusValidation,
} from "../validations/admin.validation";
import { Status } from "@/modules/users/entities/user.entity";
import { Web3Service } from "@/modules/web3/web3.service";
import { WithdrawTokenDto } from "@/modules/web3/web3.dto";
import { WithdrawTokenValidation } from "@/modules/web3/web3.validation";
import { QuidaxService } from "@/modules/quidax/quidax.service";
import { AdminRoleGuard } from "@/guards/admin-role.guard";
import { AllowAllAdmins, AllowRoles } from "@/guards/decorator/roles.decorator";
import { AdministratorRoles } from "../entities/administrator.entity";

@ApiTags("Admin")
@ApiCookieAuth(_ADMIN_AUTH_COOKIE_NAME_)
@UseGuards(AdminAuthGuard, AdminRoleGuard)
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
  @AllowAllAdmins()
  @Get("profile")
  async profile(@Req() req: AdminRequest) {
    return this.administratorService.getProfile(req);
  }

  @ApiOperation({ summary: "Update the currently logged-in admin's profile" })
  @UsePipes(new JoiValidationPipe(UpdateAdminProfileValidation))
  @AllowAllAdmins()
  @Patch("profile")
  async updateProfile(
    @Body() updateAdminProfileDto: UpdateAdminProfileDto,
    @Req() req: AdminRequest,
  ) {
    return this.administratorService.updateProfile(updateAdminProfileDto, req);
  }

  @ApiOperation({ summary: "Change the currently logged-in admin's password" })
  @UsePipes(new JoiValidationPipe(ChangeAdminPasswordValidation))
  @AllowAllAdmins()
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

  @ApiOperation({ summary: "Invite a new staff member (super_admin only)" })
  @UsePipes(new JoiValidationPipe(CreateStaffValidation))
  @Post("staff/invite")
  async createStaff(
    @Body() createStaffDto: CreateStaffDto,
    @Req() req: AdminRequest,
  ) {
    return this.administratorService.createStaff(createStaffDto, req);
  }

  @ApiOperation({ summary: "List staff accounts (super_admin only)" })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["active", "suspend", "pending"],
  })
  @ApiQuery({
    name: "role",
    required: false,
    enum: ["super_admin", "marketer"],
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @Get("staff")
  async getStaff(@Req() req: AdminRequest) {
    return this.administratorService.getStaff(req);
  }

  @ApiOperation({
    summary: "Enable or disable a staff account (super_admin only)",
  })
  @UsePipes(new JoiValidationPipe(UpdateStaffStatusValidation))
  @Patch("staff/:id/status")
  async updateStaffStatus(
    @Param("id") id: string,
    @Body() updateStaffStatusDto: UpdateStaffStatusDto,
    @Req() req: AdminRequest,
  ) {
    return this.administratorService.updateStaffStatus(
      id,
      updateStaffStatusDto,
      req,
    );
  }

  @ApiOperation({ summary: "Resend a staff invite link (super_admin only)" })
  @Post("staff/:id/resend-invite")
  async resendStaffInvite(@Param("id") id: string, @Req() req: AdminRequest) {
    return this.administratorService.resendStaffInvite(id, req);
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
  @ApiQuery({
    name: "period",
    required: false,
    enum: ["today", "week", "month", "year"],
    description:
      "Scopes signups, funded accounts and transacting users. Omit for all-time.",
  })
  @AllowRoles(AdministratorRoles.marketer)
  @Get("analytics/overview")
  async analyticsOverview(@Query("period") period?: string) {
    const valid = ["today", "week", "month", "year"] as const;
    return await this.analyticsService.overview(
      valid.includes(period as any) ? (period as (typeof valid)[number]) : undefined,
    );
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
  @AllowRoles(AdministratorRoles.marketer)
  @Get("analytics/volume")
  async analyticsVolume(@Query("granularity") granularity?: string) {
    const valid = ["daily", "weekly", "monthly", "yearly"] as const;
    const g = valid.includes(granularity as any)
      ? (granularity as (typeof valid)[number])
      : "weekly";
    return await this.analyticsService.volumeSeries(g);
  }

  @ApiOperation({ summary: "Analytics: daily inflow vs outflow" })
  @ApiQuery({ name: "date_from", required: false, type: String })
  @ApiQuery({ name: "date_to", required: false, type: String })
  @AllowRoles(AdministratorRoles.marketer)
  @Get("analytics/cash-flow")
  async analyticsCashFlow(
    @Query("date_from") dateFrom?: string,
    @Query("date_to") dateTo?: string,
  ) {
    return await this.analyticsService.cashFlow(dateFrom, dateTo);
  }

  @ApiOperation({ summary: "Analytics: crypto deposits by coin and depositor" })
  @ApiQuery({ name: "date_from", required: false, type: String })
  @ApiQuery({ name: "date_to", required: false, type: String })
  @AllowRoles(AdministratorRoles.marketer)
  @Get("analytics/crypto-deposits")
  async analyticsCryptoDeposits(
    @Query("date_from") dateFrom?: string,
    @Query("date_to") dateTo?: string,
  ) {
    return await this.analyticsService.cryptoDeposits(dateFrom, dateTo);
  }

  @ApiOperation({ summary: "Analytics: daily transacting users and signups" })
  @ApiQuery({ name: "days", required: false, type: Number })
  @ApiQuery({ name: "date_from", required: false, type: String })
  @ApiQuery({ name: "date_to", required: false, type: String })
  @AllowRoles(AdministratorRoles.marketer)
  @Get("analytics/daily-users")
  async analyticsDailyUsers(
    @Query("days") days?: string,
    @Query("date_from") dateFrom?: string,
    @Query("date_to") dateTo?: string,
  ) {
    const d = Math.min(365, Math.max(7, parseInt(days ?? "30", 10) || 30));
    return await this.analyticsService.dailyUsers(d, dateFrom, dateTo);
  }

  @ApiOperation({
    summary: "Analytics: registration → KYC funnel (by registration date)",
  })
  @ApiQuery({ name: "date_from", required: false, type: String })
  @ApiQuery({ name: "date_to", required: false, type: String })
  @AllowRoles(AdministratorRoles.marketer)
  @Get("analytics/kyc-funnel")
  async analyticsKycFunnel(
    @Query("date_from") dateFrom?: string,
    @Query("date_to") dateTo?: string,
  ) {
    return await this.analyticsService.kycFunnel(dateFrom, dateTo);
  }

  @ApiOperation({ summary: "Analytics: user & volume locations" })
  @AllowRoles(AdministratorRoles.marketer)
  @Get("analytics/locations")
  async analyticsLocations() {
    return await this.analyticsService.userLocations();
  }

  @ApiOperation({ summary: "Get dashboard KPI" })
  @AllowRoles(AdministratorRoles.marketer)
  @Get("dashboard-kpi")
  async getDashboardKPI(@Req() req: AdminRequest) {
    return this.administratorService.getDashboardKPI(req);
  }

  @ApiOperation({
    summary: "Get users by KYC stage (defaults to those who have not started)",
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["none", "pending", "success", "failed"],
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
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

  @AllowAllAdmins()
  @Delete("logout")
  async logout(@Req() req: AdminRequest, @Res() res: Response) {
    //Clear cache
    Object.keys(SystemCache).forEach((key) => {
      this.cacheService.del(`${SystemCache[key]}_${req.admin.id}`);
    });

    // AdminAuthGuard reads the admin through this key on every request, so it
    // has to go too — the SystemCache loop above uses a different key shape.
    this.cacheService.del(`admin:${req.admin.id}`);

    res.clearCookie(_ADMIN_AUTH_COOKIE_NAME_, ClearCookieOptions);
    res.json({
      success: true,
      message: "You have been logged out of this session",
    });
  }
}
