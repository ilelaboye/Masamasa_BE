import { _AUTH_COOKIE_NAME_ } from "@/constants";
import { UserRequest } from "@/definitions";
import { AuthGuard } from "@/guards";
import {
  Controller,
  Get,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { WalletService } from "./wallet.service";

@ApiCookieAuth(_AUTH_COOKIE_NAME_)
@UseGuards(AuthGuard)
@ApiTags("Wallet")
@Controller("wallet")
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get("")
  async findAll(@Req() req: UserRequest) {
    return await this.walletService.findAll(req);
  }

  @Get("expired")
  async findExpiredWallets(@Req() req: UserRequest) {
    return await this.walletService.findExpiredWallets(req);
  }
}
