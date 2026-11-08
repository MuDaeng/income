import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyExchangeRate } from '@app/common';
import { MassiveModule } from '../massive/massive.module.js';
import { ExchangeRateController } from './exchange-rate.controller.js';
import { ExchangeRateService } from './exchange-rate.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([DailyExchangeRate]), MassiveModule],
  controllers: [ExchangeRateController],
  providers: [ExchangeRateService],
})
export class ExchangeRateModule {}
