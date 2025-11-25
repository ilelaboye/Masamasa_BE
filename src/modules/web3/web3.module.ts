import { Module } from '@nestjs/common';
import { Web3Controller } from './web3.controller';

@Module({
  controllers: [Web3Controller]
})
export class Web3Module {}
