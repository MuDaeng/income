import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DailyExchangeRate,
  DailySecurity,
  DataGoKrModule,
  Dividend,
  KisModule,
  MassiveModule,
  Security,
  SecuritySearch,
} from '@app/common';
import { DailyPriceFetcher } from './daily-price.fetcher.js';
import { DailyPriceReader } from './daily-price.reader.js';
import { DailySecurityController } from './restapi/daily-security.controller.js';
import { DailySecurityService } from './restapi/daily-security.service.js';
import { DividendFetcher } from './dividend.fetcher.js';
import { DividendService } from './restapi/dividend.service.js';
import { DividendController } from './restapi/dividend.controller.js';
import { ExchangeRateReader } from './exchange-rate.reader.js';
import { SecurityRefresher } from './security.refresher.js';
import { SecurityController } from './restapi/security.controller.js';
import { SecurityService } from './restapi/security.service.js';

/**
 * libs/common `security/` 엔티티(종목·일별 시세·환율·배당·조회 기록)를 다루는 업무 모듈.
 * 종목 목록·미국 일별 시세·환율 가져오기는 batch 전용(@app/common의 import 모듈). api에는 수집 API가 없고,
 * 국내 시세·배당은 조회할 때 SecurityRefresher가 종목별로 갱신한다.
 * 다른 모듈에는 구현 계층(Refresher·Reader)만 내보낸다
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Security,
      DailySecurity,
      DailyExchangeRate,
      Dividend,
      SecuritySearch,
    ]),
    MassiveModule,
    DataGoKrModule,
    KisModule,
  ],
  controllers: [
    SecurityController,
    DailySecurityController,
    DividendController,
  ],
  providers: [
    SecurityService,
    DailySecurityService,
    DividendService,
    DividendFetcher,
    DailyPriceFetcher,
    SecurityRefresher,
    DailyPriceReader,
    ExchangeRateReader,
  ],
  exports: [SecurityRefresher, DailyPriceReader, ExchangeRateReader],
})
export class SecurityModule {}
