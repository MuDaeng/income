import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MassiveModule } from '../client/massive/massive.module.js';
import { TossModule } from '../client/toss/toss.module.js';
import { DailyExchangeRate } from './daily-exchange-rate.entity.js';
import { DailySecurity } from './daily-security.entity.js';
import { ExchangeRateFetcher } from './exchange-rate.fetcher.js';
import { Security } from './security.entity.js';
import { SecurityFetcher } from './security.fetcher.js';
import { UsDailyPriceFetcher } from './us-daily-price.fetcher.js';

/**
 * batch 일배치의 대량 수집: Toss 종목 목록(SecurityFetcher), Massive USD/KRW 환율(ExchangeRateFetcher),
 * Massive 미국 주식 일별 시세(UsDailyPriceFetcher). api에는 수집 API가 없다
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Security, DailySecurity, DailyExchangeRate]),
    TossModule,
    MassiveModule,
  ],
  providers: [SecurityFetcher, ExchangeRateFetcher, UsDailyPriceFetcher],
  exports: [SecurityFetcher, ExchangeRateFetcher, UsDailyPriceFetcher],
})
export class SecurityImportModule {}
