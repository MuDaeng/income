import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { tossConfig } from '../../config/toss.config.js';
import { TossClient } from './toss.client.js';

@Module({
  imports: [ConfigModule.forFeature(tossConfig)],
  providers: [TossClient],
  exports: [TossClient],
})
export class TossModule {}
