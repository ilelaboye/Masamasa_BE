import { _AUTH_COOKIE_NAME_ } from "@/constants";
import { UserRequest } from "@/definitions";
import { AuthGuard } from "@/guards";

import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";

import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { JoiValidationPipe } from "@/pipes/joi.validation.pipe";

import {
  CreateWalletValidation,
  WithdrawEthValidation,
  WithdrawTokenValidation,
  TokenBalanceValidation,
} from "./web3.validation";

import {
  CreateWalletDto,
  WithdrawEthDto,
  WithdrawTokenDto,
  TokenBalanceDto,
} from "./web3.dto";

import { Web3Service } from "./web3.service";

@ApiCookieAuth(_AUTH_COOKIE_NAME_)
@UseGuards(AuthGuard)
@ApiTags("Web3 Wallet")
@Controller("wallet")
export class Web3Controller {
  constructor(private readonly web3Service: Web3Service) {}

  // Create new wallet
  @Post("/")
  @UsePipes(new JoiValidationPipe(CreateWalletValidation))
  async createWallet(@Req() req: UserRequest, @Body() body: CreateWalletDto) {
    return await this.web3Service.createWallet(req, body);
  }

  // Withdraw ETH
  @Post("/withdraw-eth")
  @UsePipes(new JoiValidationPipe(WithdrawEthValidation))
  async withdrawEth(@Req() req: UserRequest, @Body() body: WithdrawEthDto) {
    return await this.web3Service.withdrawETH(req, body);
  }

  // Withdraw Token
  @Post("/withdraw-token")
  @UsePipes(new JoiValidationPipe(WithdrawTokenValidation))
  async withdrawToken(
    @Req() req: UserRequest,
    @Body() body: WithdrawTokenDto
  ) {
    return await this.web3Service.withdrawToken(req, body);
  }

  // Get all balances
  @Get("/balances")
  async getAllBalances(@Req() req: UserRequest) {
    return await this.web3Service.getAllBalances(req);
  }

  // Upload image
  @Post("/image")
  async uploadImage(@Req() req: UserRequest, @Body() body: any) {
    return await this.web3Service.uploadImage(req, body);
  }

  // Get recent transactions
  @Get("/recent-transactions")
  async getRecentTransactions(@Req() req: UserRequest) {
    return await this.web3Service.getRecentTransactions(req);
  }

  // Get token balance
  @Post("/token-balance")
  @UsePipes(new JoiValidationPipe(TokenBalanceValidation))
  async getTokenBalance(
    @Req() req: UserRequest,
    @Body() body: TokenBalanceDto
  ) {
    return await this.web3Service.getTokenBalance(req, body);
  }
}
