import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TransactionService } from "./transactions.service";
import { Transactions } from "./transactions.entity";
import { TransactionsController } from "./transactions.controller";

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Transactions])],
  controllers: [TransactionsController],
  providers: [TransactionService],
  exports: [TransactionService],
})
export class TransactionModule {}
