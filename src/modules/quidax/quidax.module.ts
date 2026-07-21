import { Global, Module } from "@nestjs/common";
import { QuidaxService } from "./quidax.service";

@Global()
@Module({
  providers: [QuidaxService],
  exports: [QuidaxService],
})
export class QuidaxModule {}
