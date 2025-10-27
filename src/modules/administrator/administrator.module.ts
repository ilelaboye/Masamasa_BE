import { Module } from "@nestjs/common";
import { AdministratorController } from "./controllers/administrator.controller";
import { AdminAuthController } from "./controllers/admin-auth.controller";
import { AdministratorService } from "./services/administrator.service";
import { Administrator } from "./entities/administrator.entity";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminAuthService } from "./services/admin-auth.service";
import { AdminLogs } from "./entities/admin-logs.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Administrator, AdminLogs])],
  controllers: [AdministratorController, AdminAuthController],
  providers: [AdministratorService, AdminAuthService],
})
export class AdministratorModule {}
