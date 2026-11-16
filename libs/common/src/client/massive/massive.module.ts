import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { massiveConfig } from '../../config/massive.config.js';
import { MassiveClient } from './massive.client.js';

@Module({
  imports: [ConfigModule.forFeature(massiveConfig)],
  providers: [MassiveClient],
  exports: [MassiveClient],
})
export class MassiveModule {}
