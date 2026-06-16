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
  UploadedFile,
  UseInterceptors,
  Query,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";

import { JoiValidationPipe } from "@/pipes/joi.validation.pipe";

import {
  CreateWalletValidation,
  WithdrawEthValidation,
  WithdrawTokenValidation,
  TokenBalanceValidation,
  CreateDisposableWalletValidation,
  CheckDisposableWalletValidation,
  SweepDisposableWalletValidation,
  ListDisposableWalletsValidation,
} from "./web3.validation";

import { CreateWalletDto, WithdrawTokenDto, TokenBalanceDto } from "./web3.dto";
import {
  CreateDisposableWalletDto,
  CheckDisposableWalletDto,
  SweepDisposableWalletDto,
} from "./dto/disposable-wallet.dto";

import { Web3Service } from "./web3.service";
import { DisposableWalletService } from "./services/disposable-wallet.service";

@ApiCookieAuth(_AUTH_COOKIE_NAME_)
@UseGuards(AuthGuard)
@ApiTags("Web3 Wallet")
@Controller("web3")
export class Web3Controller {
  constructor(
    private readonly web3Service: Web3Service,
    private readonly disposableWalletService: DisposableWalletService,
  ) { }

  // Create new wallet
  @Post("/")
  @UsePipes(new JoiValidationPipe(CreateWalletValidation))
  async createWallet(@Req() req: UserRequest, @Body() body: CreateWalletDto) {
    return await this.web3Service.createWallet(req, body);
  }

  // Withdraw ETH
  @Get("/sweep")
  async sweepWallets(@Req() req: UserRequest) {
    return await this.web3Service.sweepWallets(req);
  }

  // Withdraw ETH
  @Get("/track")
  async trackWallets(@Req() req: UserRequest) {
    return await this.web3Service.walletsTracking(req);
  }

  // Upload image
  @Post("/image")
  @UseInterceptors(FileInterceptor("image"))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    return this.web3Service.uploadImage(file);
  }

  // Get recent transactions
  @Get("/recent-transactions")
  async getRecentTransactions() {
    return await this.web3Service.getRecentTransactions();
  }

  // Get last 3 transactions from blockchain
  @Get("/last-transaction")
  async getLastTransactions(@Req() req: UserRequest) {
    return await this.web3Service.getLastTransactionsFromBlockchain(req);
  }

  // Get Tron Wallets Tracking
  @Get("/tron-wallets-tracking")
  async getTronWalletsTracking() {
    return await this.web3Service.getTronWalletsUSDTBalances();
  }

  // ====================================
  // DISPOSABLE WALLET ENDPOINTS
  // ====================================

  // Create a new disposable wallet
  @Post("/disposable/create")
  @UsePipes(new JoiValidationPipe(CreateDisposableWalletValidation))
  async createDisposableWallet(
    @Req() req: UserRequest,
    @Body() body: CreateDisposableWalletDto
  ) {
    return await this.disposableWalletService.createDisposableWallet(body, req.user.id);
  }

  // Check disposable wallet balance and status
  @Post("/disposable/check")
  @UsePipes(new JoiValidationPipe(CheckDisposableWalletValidation))
  async checkDisposableWallet(@Body() body: CheckDisposableWalletDto) {
    return await this.disposableWalletService.checkDisposableWallet(body);
  }

  // Manually sweep a disposable wallet
  @Post("/disposable/sweep")
  @UsePipes(new JoiValidationPipe(SweepDisposableWalletValidation))
  async sweepDisposableWallet(@Body() body: SweepDisposableWalletDto) {
    return await this.disposableWalletService.sweepDisposableWallet(body);
  }

  // List all disposable wallets with filters
  @Get("/disposable/list")
  @UsePipes(new JoiValidationPipe(ListDisposableWalletsValidation))
  async listDisposableWallets(
    @Req() req: UserRequest,
    @Query("status") status?: string,
    @Query("network") network?: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
  ) {
    return await this.disposableWalletService.listDisposableWallets({
      status: status as any,
      network,
      userId: req.user.id,
      limit,
      offset,
    });
  }

  // Get disposable wallet statistics
  @Get("/disposable/statistics")
  async getDisposableWalletStatistics() {
    return await this.disposableWalletService.getStatistics();
  }
}
