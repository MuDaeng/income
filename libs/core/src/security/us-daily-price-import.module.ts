import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailySecurity, Security } from '@app/common';
import { MassiveModule } from '../clients/massive/massive.module.js';
import { UsDailyPriceImportService } from './us-daily-price-import.service.js';

/** Massive 미국 주식 일별 시세 가져오기 (api 수동 가져오기·batch 일배치 공용) */
@Module({
  imports: [TypeOrmModule.forFeature([DailySecurity, Security]), MassiveModule],
  providers: [UsDailyPriceImportService],
  exports: [UsDailyPriceImportService],
})
export class UsDailyPriceImportModule {}
