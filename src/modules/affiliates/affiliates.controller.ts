import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { AffiliatesService } from "./affiliates.service";

// Public: the affiliate page is opened from the invite email's link without a
// login, and the uuid in that link is what grants access.
@ApiTags("Affiliates")
@Controller("affiliates")
export class AffiliatesController {
  constructor(private readonly affiliatesService: AffiliatesService) {}

  @ApiOperation({
    summary: "An affiliate's own page: the users they referred and their KPIs",
  })
  @ApiQuery({
    name: "period",
    required: false,
    enum: ["today", "week", "month", "year"],
    description:
      "Scopes transacting users, deposits and commission to that calendar period. Omit for all time.",
  })
  @Get(":uuid")
  async getAffiliateReport(
    @Param("uuid") uuid: string,
    @Query("period") period?: string,
  ) {
    return this.affiliatesService.getAffiliateReport(uuid, period);
  }
}
