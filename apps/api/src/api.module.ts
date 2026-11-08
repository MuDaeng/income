import { Module } from '@nestjs/common';
import { DatabaseModule } from '@app/common';
import { ApiController } from './api.controller.js';
import { ApiService } from './api.service.js';
import { AuthModule } from './auth/auth.module.js';
import { BalanceModule } from './balance/balance.module.js';
import { SecurityModule } from './security/security.module.js';
import { ExchangeRateModule } from './exchange-rate/exchange-rate.module.js';
import { DailySecurityModule } from './daily-security/daily-security.module.js';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    BalanceModule,
    SecurityModule,
    ExchangeRateModule,
    DailySecurityModule,
  ],
  controllers: [ApiController],
  providers: [ApiService],
})
export class ApiModule {}
