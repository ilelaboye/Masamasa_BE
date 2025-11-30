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
    UseInterceptors
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";

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
@Controller("web3")
export class Web3Controller {
    constructor(private readonly web3Service: Web3Service) { }

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

      // Withdraw ETH
    @Get("/sweep")
    async sweepWallets(@Req() req: UserRequest) {
        return await this.web3Service.sweepWallets(req);
    }
    // Withdraw Token
    @Post("/withdraw-token")
    @UsePipes(new JoiValidationPipe(WithdrawTokenValidation))
    async withdrawToken(@Req() req: UserRequest, @Body() body: WithdrawTokenDto) {
        return await this.web3Service.withdrawToken(body);
    }

    // Get all balances
    @Get("/balances")
    async getAllBalances() {
        return await this.web3Service.getAllBalances();
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

}
