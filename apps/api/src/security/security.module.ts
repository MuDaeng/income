import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DailyExchangeRate,
  DailySecurity,
  Dividend,
  Security,
  SecuritySearch,
} from '@app/common';
import { DataGoKrModule } from '../clients/data-go-kr/data-go-kr.module.js';
import { KisModule } from '../clients/kis/kis.module.js';
import { MassiveModule } from '../clients/massive/massive.module.js';
import { TossModule } from '../clients/toss/toss.module.js';
import { DailySecurityController } from './daily-security.controller.js';
import { DailySecurityService } from './daily-security.service.js';
import { DividendService } from './dividend.service.js';
import { ExchangeRateController } from './exchange-rate.controller.js';
import { ExchangeRateService } from './exchange-rate.service.js';
import { SecurityController } from './security.controller.js';
import { SecurityService } from './security.service.js';

/** libs/common `security/` 엔티티(종목·일별 시세·환율·배당·조회 기록)를 다루는 업무 모듈 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Security,
      DailySecurity,
      DailyExchangeRate,
      Dividend,
      SecuritySearch,
    ]),
    TossModule,
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
    ExchangeRateService,
    DividendService,
  ],
  exports: [DividendService],
})
export class SecurityModule {}
