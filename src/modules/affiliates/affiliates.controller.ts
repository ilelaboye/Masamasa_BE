import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { _ADMIN_AUTH_COOKIE_NAME_ } from "@/constants";
import { AdminRequest } from "@/definitions";
import { AdminAuthGuard } from "@/guards/admin-auth.guard";
import { AdminRoleGuard } from "@/guards/admin-role.guard";
import { AllowRoles } from "@/guards/decorator/roles.decorator";
import { JoiValidationPipe } from "@/pipes/joi.validation.pipe";
import { AdministratorRoles } from "../administrator/entities/administrator.entity";
import { AffiliatesService } from "./affiliates.service";
import { CreateAffiliateDto } from "./dto/affiliate.dto";
import { AffiliateStatus } from "./entities/affiliate.entity";
import { CreateAffiliateValidation } from "./validations/affiliate.validation";

@ApiTags("Admin")
@ApiCookieAuth(_ADMIN_AUTH_COOKIE_NAME_)
@UseGuards(AdminAuthGuard, AdminRoleGuard)
@Controller("admin/affiliates")
export class AffiliatesController {
  constructor(private readonly affiliatesService: AffiliatesService) {}

  @ApiOperation({ summary: "Save one or more users as affiliates" })
  @AllowRoles(AdministratorRoles.marketer)
  @Post()
  @UsePipes(new JoiValidationPipe(CreateAffiliateValidation))
  async createAffiliate(
    @Body() createAffiliateDto: CreateAffiliateDto,
    @Req() req: AdminRequest,
  ) {
    return await this.affiliatesService.createAffiliate(
      createAffiliateDto,
      req,
    );
  }

  @ApiOperation({ summary: "Get all affiliates with their user details" })
  @ApiQuery({
    name: "search",
    required: false,
    description: "Matches first name, last name, full name, username or email",
  })
  @ApiQuery({ name: "status", required: false, enum: AffiliateStatus })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @AllowRoles(AdministratorRoles.marketer, AdministratorRoles.support)
  @Get()
  async getAffiliates(@Req() req: AdminRequest) {
    return await this.affiliatesService.getAffiliates(req);
  }

  @ApiOperation({
    summary:
      "Get one affiliate with the users they referred and each referral's deposits",
  })
  @AllowRoles(AdministratorRoles.marketer, AdministratorRoles.support)
  @ApiQuery({
    name: "period",
    required: false,
    enum: ["today", "week", "month", "year"],
    description:
      "Scopes transacting users, deposits and commission to that calendar period. Omit for all time.",
  })
  @Get(":uuid")
  async getAffiliate(
    @Param("uuid") uuid: string,
    @Query("period") period?: string,
  ) {
    const valid = ["today", "week", "month", "year"] as const;
    return await this.affiliatesService.getAffiliate(
      uuid,
      valid.includes(period as (typeof valid)[number])
        ? (period as (typeof valid)[number])
        : undefined,
    );
  }
}
