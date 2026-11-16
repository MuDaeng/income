import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import {
  BatchHistoryModule,
  DatabaseModule,
  SecurityImportModule,
  TokenModule,
} from '@app/common';
import { BatchJobs } from './scheduler/batch.jobs.js';

/** 일배치 앱 루트 (HTTP 없음). 잡은 scheduler/의 BatchJobs(@Cron) */
@Module({
  imports: [
    DatabaseModule,
    ScheduleModule.forRoot(),
    SecurityImportModule,
    TokenModule,
    BatchHistoryModule,
  ],
  providers: [BatchJobs],
})
export class BatchModule {}
