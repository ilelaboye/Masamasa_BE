import { User } from "@/modules/users/entities/user.entity";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PublicController } from "./public.controller";
import { PublicService } from "./public.service";

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
