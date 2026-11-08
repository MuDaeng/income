import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { massiveConfig } from '@app/common';
import { MassiveClient } from './massive.client.js';

@Module({
  imports: [ConfigModule.forFeature(massiveConfig)],
  providers: [MassiveClient],
  exports: [MassiveClient],
})
export class MassiveModule {}
