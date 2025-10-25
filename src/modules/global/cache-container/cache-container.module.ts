import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache-container.service';

@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheContainerModule {}
