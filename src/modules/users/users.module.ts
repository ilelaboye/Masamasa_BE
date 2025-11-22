import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthController, UsersController } from "./controllers";
import { User } from "./entities/user.entity";
import { AuthService } from "./services/auth.service";
import { UsersService } from "./services/users.service";
import { Transfer } from "../transfers/transfers.entity";
import { BankVerificationService } from "../global/bank-verification/bank-verification.service";
import { BankVerification } from "../global/bank-verification/entities/bank-verification.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Transfer, BankVerification]),
    EventEmitterModule.forRoot(),
  ],
  controllers: [AuthController, UsersController],
  providers: [UsersService, AuthService, BankVerificationService],
})
export class UsersModule {}
