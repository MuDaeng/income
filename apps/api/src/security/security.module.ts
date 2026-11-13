import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailySecurity, Dividend, Security, SecuritySearch } from '@app/common';
import {
  DataGoKrModule,
  ExchangeRateImportModule,
  KisModule,
  MassiveModule,
  UsDailyPriceImportModule,
} from '@app/core';
import { DailyPriceFetcher } from './daily-price.fetcher.js';
import { DailySecurityController } from './daily-security.controller.js';
import { DailySecurityService } from './daily-security.service.js';
import { DividendService } from './dividend.service.js';
import { ExchangeRateController } from './exchange-rate.controller.js';
import { SecurityRefreshService } from './security-refresh.service.js';
import { SecurityController } from './security.controller.js';
import { SecurityService } from './security.service.js';

/**
 * libs/common `security/` 엔티티(종목·일별 시세·환율·배당·조회 기록)를 다루는 업무 모듈.
 * 환율·미국 일별 시세 가져오기는 batch와 같이 쓰는 @app/core 모듈(ExchangeRateImportModule·UsDailyPriceImportModule).
 * 종목 목록 가져오기(Toss)는 batch 전용(SecurityImportModule)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Security,
      DailySecurity,
      Dividend,
      SecuritySearch,
    ]),
    ExchangeRateImportModule,
    UsDailyPriceImportModule,
    MassiveModule,
    DataGoKrModule,
    KisModule,
  ],
  controllers: [
    SecurityController,
    DailySecurityController,
    ExchangeRateController,
  ],
  providers: [
    SecurityService,
    DailySecurityService,
    DividendService,
    DailyPriceFetcher,
    SecurityRefreshService,
  ],
  exports: [SecurityRefreshService],
})
export class SecurityModule {}
