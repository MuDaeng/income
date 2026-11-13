import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyExchangeRate } from '@app/common';
import { MassiveModule } from '../clients/massive/massive.module.js';
import { ExchangeRateService } from './exchange-rate.service.js';

/** Massive USD/KRW 환율 가져오기 (api 수동 가져오기·batch 일배치 공용) */
@Module({
  imports: [TypeOrmModule.forFeature([DailyExchangeRate]), MassiveModule],
  providers: [ExchangeRateService],
  exports: [ExchangeRateService],
})
export class ExchangeRateImportModule {}
