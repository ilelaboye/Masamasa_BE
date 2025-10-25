import { BullModule } from "@nestjs/bull";
import { CacheModule } from "@nestjs/cache-manager";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { TypeOrmModule } from "@nestjs/typeorm";
import * as redisStore from "cache-manager-redis-store";
import { appConfig, dataSource } from "./config";
import { _IS_PROD_ } from "./constants";
// import { SentryModule } from '@sentry/nestjs/setup';
import {
  CacheContainerModule,
  CloudinaryModule,
  CronModule,
  PublicModule,
  ScheduledTaskModule,
  UsersModule,
  WalletModule,
} from "./modules";
import { ConfigModuleSchema } from "./validations";

@Module({
  imports: [
    TypeOrmModule.forRoot(dataSource),
    // SentryModule.forRoot(),
    JwtModule.register({
      secret: appConfig.JWT_SECRET,
      signOptions: { expiresIn: appConfig.JWT_EXPIRES_IN },
      global: true,
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: _IS_PROD_ ? 50 : 100 }]),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: ConfigModuleSchema,
      validationOptions: { abortEarly: true },
    }),
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      redis: {
        host: appConfig.REDIS_HOST,
        port: appConfig.REDIS_PORT,
        password: appConfig.REDIS_PASSWORD,
      },
    }),
    CacheModule.register({
      ttl: 60 * 20,
      isGlobal: true,
      max: 5000,
      store: redisStore,
      host: appConfig.REDIS_HOST,
      port: appConfig.REDIS_PORT,
    }),
    CloudinaryModule,
    PublicModule,
    CronModule,
    ScheduledTaskModule,
    CacheContainerModule,
    UsersModule,
    WalletModule,
  ],
  providers: [JwtService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
