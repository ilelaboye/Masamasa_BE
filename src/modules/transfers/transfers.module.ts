import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Transfer } from "./transfers.entity";

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Transfer])],
  controllers: [],
  providers: [],
  exports: [],
})
export class TransferModule {}
