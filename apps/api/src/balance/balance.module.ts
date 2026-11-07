import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseDateBalance, Security, User, UserBalance } from '@app/common';
import { BalanceService } from './balance.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([PurchaseDateBalance, UserBalance, User, Security])],
  providers: [BalanceService],
  exports: [BalanceService],
})
export class BalanceModule {}