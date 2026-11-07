import { Module } from '@nestjs/common';
import { DatabaseModule } from '@app/common';
import { ApiController } from './api.controller.js';
import { ApiService } from './api.service.js';
import { AuthModule } from './auth/auth.module.js';
import { BalanceModule } from './balance/balance.module.js';

@Module({
  imports: [DatabaseModule, AuthModule, BalanceModule],
  controllers: [ApiController],
  providers: [ApiService],
})
export class ApiModule {}
