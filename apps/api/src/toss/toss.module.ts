import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { tossConfig } from '@app/common';
import { TossClient } from './toss.client.js';

@Module({
  imports: [ConfigModule.forFeature(tossConfig)],
  providers: [TossClient],
  exports: [TossClient],
})
export class TossModule {}
