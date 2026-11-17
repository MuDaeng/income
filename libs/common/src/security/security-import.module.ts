import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataGoKrModule } from '../client/data-go-kr/data-go-kr.module.js';
import { MassiveModule } from '../client/massive/massive.module.js';
import { TossModule } from '../client/toss/toss.module.js';
import { DailyExchangeRate } from './daily-exchange-rate.entity.js';
import { DailySecurity } from './daily-security.entity.js';
import { DomesticDailyPriceFetcher } from './domestic-daily-price.fetcher.js';
import { ExchangeRateFetcher } from './exchange-rate.fetcher.js';
import { Security } from './security.entity.js';
import { SecurityFetcher } from './security.fetcher.js';
import { UsDailyPriceFetcher } from './us-daily-price.fetcher.js';

/**
 * 대량 수집: Toss 종목 목록(SecurityFetcher), Massive USD/KRW 환율(ExchangeRateFetcher),
 * Massive 미국 주식 일별 시세(UsDailyPriceFetcher), data.go.kr 국내 주식·ETF 일별 시세(DomesticDailyPriceFetcher).
 * batch 일배치가 쓰고, api는 관리자 일회용 국내 시세 전체 적재에서만 쓴다
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Security, DailySecurity, DailyExchangeRate]),
    TossModule,
    MassiveModule,
    DataGoKrModule,
  ],
  providers: [
    SecurityFetcher,
    ExchangeRateFetcher,
    UsDailyPriceFetcher,
    DomesticDailyPriceFetcher,
  ],
  exports: [
    SecurityFetcher,
    ExchangeRateFetcher,
    UsDailyPriceFetcher,
    DomesticDailyPriceFetcher,
  ],
})
export class SecurityImportModule {}
