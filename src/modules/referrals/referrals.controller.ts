import { _AUTH_COOKIE_NAME_ } from "@/constants";
import { UserRequest } from "@/definitions";
import { AuthGuard } from "@/guards";
import { Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { ReferralsService } from "./referrals.service";

@ApiCookieAuth(_AUTH_COOKIE_NAME_)
@UseGuards(AuthGuard)
@ApiTags("Referrals")
@Controller("referrals")
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  /** Everything the Refer & Earn screen needs: code, totals, referral list. */
  @Get("summary")
  async summary(@Req() req: UserRequest) {
    return await this.referralsService.summary(req.user.id);
  }

  /** Reward history, newest first. */
  @Get("earnings")
  async earnings(
    @Req() req: UserRequest,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    // Clamped rather than validated with a pipe: these are optional query
    // params with sane defaults, and a bad value should fall back rather than
    // 400 a read-only list.
    const parsedPage = Math.max(1, parseInt(page ?? "1", 10) || 1);
    const parsedLimit = Math.min(
      100,
      Math.max(1, parseInt(limit ?? "20", 10) || 20),
    );

    return await this.referralsService.earnings(
      req.user.id,
      parsedPage,
      parsedLimit,
    );
  }

  /**
   * Moves the whole earning-account balance into the main balance.
   *
   * Takes no amount — rewards are settled as whole rows, so there is nothing
   * partial to request. See ReferralsService.withdrawToMainAccount.
   */
  @Post("withdraw")
  async withdraw(@Req() req: UserRequest) {
    const result = await this.referralsService.withdrawToMainAccount(
      req.user.id,
    );
    const { message, ...data } = result;
    return { data, message };
  }
}
