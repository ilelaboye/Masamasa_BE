import { _AUTH_COOKIE_NAME_ } from "@/constants";
import { UserRequest } from "@/definitions";
import { AuthGuard } from "@/guards";
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { WalletService } from "./wallet.service";
import { JoiValidationPipe } from "@/pipes/joi.validation.pipe";
import { CreateWalletValidation } from "./wallet.validation";
import { CreateWalletDto } from "./wallet.dto";

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
}
