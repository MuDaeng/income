import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Dividend,
  PurchaseDateBalance,
  Security,
  User,
  UserBalance,
} from '@app/common';
import { SecurityModule } from '../security/security.module.js';
import { BalanceController } from './balance.controller.js';
import { BalanceService } from './balance.service.js';
import { DividendHistoryCalculator } from './dividend-history.calculator.js';
import { DividendHistoryService } from './dividend-history.service.js';
import { MonthlyBalanceService } from './monthly-balance.service.js';
import { PeriodReturnService } from './period-return.service.js';
import { PurchaseRateReader } from './purchase-rate.reader.js';
import { PurchaseReader } from './purchase.reader.js';
import { PurchaseWriter } from './purchase.writer.js';

@Module({
  imports: [
    SecurityModule,
    TypeOrmModule.forFeature([
      PurchaseDateBalance,
      UserBalance,
      User,
      Security,
      Dividend,
    ]),
  ],
  controllers: [BalanceController],
  providers: [
    BalanceService,
    DividendHistoryService,
    PeriodReturnService,
    MonthlyBalanceService,
    PurchaseReader,
    PurchaseRateReader,
    PurchaseWriter,
    DividendHistoryCalculator,
  ],
})
export class BalanceModule {}
