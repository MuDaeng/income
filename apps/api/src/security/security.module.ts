import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyExchangeRate, DailySecurity, Security } from '@app/common';
import { DataGoKrModule } from '../clients/data-go-kr/data-go-kr.module.js';
import { MassiveModule } from '../clients/massive/massive.module.js';
import { TossModule } from '../clients/toss/toss.module.js';
import { DailySecurityController } from './daily-security.controller.js';
import { DailySecurityService } from './daily-security.service.js';
import { ExchangeRateController } from './exchange-rate.controller.js';
import { ExchangeRateService } from './exchange-rate.service.js';
import { SecurityController } from './security.controller.js';
import { SecurityService } from './security.service.js';

/** libs/common `security/` 엔티티(종목·일별 시세·환율)를 다루는 업무 모듈 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Security, DailySecurity, DailyExchangeRate]),
    TossModule,
    MassiveModule,
    DataGoKrModule,
  ],
  controllers: [
    SecurityController,
    DailySecurityController,
    ExchangeRateController,
  ],
  providers: [SecurityService, DailySecurityService, ExchangeRateService],
})
export class SecurityModule {}
