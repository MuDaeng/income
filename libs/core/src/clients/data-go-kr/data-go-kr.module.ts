import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { dataGoKrConfig } from '@app/common';
import { DataGoKrClient } from './data-go-kr.client.js';

@Module({
  imports: [ConfigModule.forFeature(dataGoKrConfig)],
  providers: [DataGoKrClient],
  exports: [DataGoKrClient],
})
export class DataGoKrModule {}
