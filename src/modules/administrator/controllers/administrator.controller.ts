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
import { CreateExchangeRateDto } from "../dto/admin.dto";

@ApiTags("Admin")
@ApiCookieAuth(_ADMIN_AUTH_COOKIE_NAME_)
@UseGuards(AdminAuthGuard)
@Controller("admin")
export class AdministratorController {
  constructor(
    private readonly administratorService: AdministratorService,
    private readonly cacheService: CacheService
  ) {}

  // @ApiOperation({ summary: "Get Companies" })
  // @ApiQuery({
  //   name: "search",
  //   required: false,
  //   description: "Search by company name",
  // })
  // @ApiQuery({
  //   name: "limit",
  //   required: false,
  //   description: "How many data per page? Maximum of 100 data",
  //   type: "number",
  // })
  // @ApiQuery({
  //   name: "page",
  //   required: false,
  //   description: "Page of payment request data",
  //   type: "number",
  // })
  // @ApiQuery({
  //   name: "date_from",
  //   required: false,
  //   description: "Filter by date created",
  // })
  // @ApiQuery({
  //   name: "date_to",
  //   required: false,
  //   description: "Filter by date created",
  // })
  // @Get("companies")
  // async companies(@Req() req: AdminRequest) {
  //   return await this.adminCompanyService.getCompanies(req);
  // }

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

  @Get("dashboard-kpi")
  async getDashboardKPI(@Req() req: AdminRequest) {
    return this.administratorService.getDashboardKPI(req);
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
  async createExchangeRate(
    @Body() createExchangeRateDto: CreateExchangeRateDto,
    @Req() req: AdminRequest
  ) {
    return this.administratorService.saveExchangeRate(
      createExchangeRateDto,
      req
    );
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
