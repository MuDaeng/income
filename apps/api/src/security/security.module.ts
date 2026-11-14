import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailySecurity, Dividend, Security, SecuritySearch } from '@app/common';
import {
  DataGoKrModule,
  KisModule,
  MassiveModule,
} from '@app/core';
import { DailyPriceFetcher } from './daily-price.fetcher.js';
import { DailySecurityController } from './daily-security.controller.js';
import { DailySecurityService } from './daily-security.service.js';
import { DividendService } from './dividend.service.js';
import { SecurityRefreshService } from './security-refresh.service.js';
import { SecurityController } from './security.controller.js';
import { SecurityService } from './security.service.js';

/**
 * libs/common `security/` 엔티티(종목·일별 시세·환율·배당·조회 기록)를 다루는 업무 모듈.
 * 종목 목록·미국 일별 시세·환율 가져오기는 batch 전용(@app/core의 import 모듈). api에는 수집 API가 없고,
 * 국내 시세·배당은 조회할 때 SecurityRefreshService가 종목별로 갱신한다
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Security,
      DailySecurity,
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
