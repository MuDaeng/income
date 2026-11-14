import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '@app/common';
import {
  ExchangeRateImportModule,
  SecurityImportModule,
  TokenCleanupModule,
  UsDailyPriceImportModule,
} from '@app/core';
import { BatchJobs } from './batch.jobs.js';

/** 일배치 앱 루트 (HTTP 없음). 잡은 BatchJobs의 @Cron */
@Module({
  imports: [
    DatabaseModule,
    ScheduleModule.forRoot(),
    ExchangeRateImportModule,
    SecurityImportModule,
    UsDailyPriceImportModule,
    TokenCleanupModule,
  ],
  providers: [BatchJobs],
})
export class BatchModule {}
