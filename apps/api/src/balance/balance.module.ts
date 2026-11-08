import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DailyExchangeRate,
  DailySecurity,
  PurchaseDateBalance,
  Security,
  User,
  UserBalance,
} from '@app/common';
import { SecurityModule } from '../security/security.module.js';
import { BalanceController } from './balance.controller.js';
import { BalanceService } from './balance.service.js';

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
    ]),
  ],
  controllers: [BalanceController],
  providers: [BalanceService],
  exports: [BalanceService],
})
export class BalanceModule {}
