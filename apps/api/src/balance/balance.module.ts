import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DailySecurity,
  PurchaseDateBalance,
  Security,
  User,
  UserBalance,
} from '@app/common';
import { BalanceController } from './balance.controller.js';
import { BalanceService } from './balance.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PurchaseDateBalance,
      UserBalance,
      User,
      Security,
      DailySecurity,
    ]),
  ],
  controllers: [BalanceController],
  providers: [BalanceService],
  exports: [BalanceService],
})
export class BalanceModule {}
