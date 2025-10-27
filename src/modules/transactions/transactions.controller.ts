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
import { TransactionService } from "./transactions.service";

@ApiCookieAuth(_AUTH_COOKIE_NAME_)
@UseGuards(AuthGuard)
@ApiTags("Transactions")
@Controller("transactions")
export class TransactionsController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get("")
  async findAll(@Req() req: UserRequest) {
    return await this.transactionService.findAll(req);
  }
}
