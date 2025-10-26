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
@ApiTags("Wallet")
@UseGuards(AuthGuard)
@Controller("wallet")
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @UsePipes(new JoiValidationPipe(CreateWalletValidation))
  @Post("create")
  async create(
    @Body() createWalletDto: CreateWalletDto,
    @Req() req: UserRequest
  ) {
    return await this.walletService.saveWalletAddress(createWalletDto, req);
  }

  @Get("")
  async findAll(@Req() req: UserRequest) {
    return await this.walletService.findAll(req);
  }
}
