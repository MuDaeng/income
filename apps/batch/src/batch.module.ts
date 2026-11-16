import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BatchHistory,
  DatabaseModule,
  ExchangeRateImportModule,
  SecurityImportModule,
  TokenCleanupModule,
  UsDailyPriceImportModule,
} from '@app/common';
import { BatchHistoryService } from './batch-history.service.js';
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
    TypeOrmModule.forFeature([BatchHistory]),
  ],
  providers: [BatchJobs, BatchHistoryService],
})
export class BatchModule {}
