import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DailyExchangeRate,
  DailySecurity,
  Dividend,
  PurchaseDateBalance,
  Security,
  User,
  UserBalance,
} from '@app/common';
import { SecurityModule } from '../security/security.module.js';
import { BalanceController } from './balance.controller.js';
import { BalanceService } from './balance.service.js';
import { DividendHistoryService } from './dividend-history.service.js';

@Module({
  imports: [
    SecurityModule,
    TypeOrmModule.forFeature([
      PurchaseDateBalance,
      UserBalance,
      User,
      Security,
      DailySecurity,
      DailyExchangeRate,
      Dividend,
    ]),
  ],
  controllers: [BalanceController],
  providers: [BalanceService, DividendHistoryService],
  exports: [BalanceService],
})
export class BalanceModule {}
