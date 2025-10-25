import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  AuthController,
  StaffsController,
  UsersController,
} from "./controllers";
import { User } from "./entities/user.entity";
import { AuthService } from "./services/auth.service";
import { UsersService } from "./services/users.service";

@Module({
  imports: [TypeOrmModule.forFeature([User]), EventEmitterModule.forRoot()],
  controllers: [AuthController, UsersController, StaffsController],
  providers: [UsersService, AuthService],
})
export class UsersModule {}
