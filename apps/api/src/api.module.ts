import { Module } from '@nestjs/common';
import { DatabaseModule } from '@app/common';
import { AuthModule } from './auth/auth.module.js';
import { BalanceModule } from './balance/balance.module.js';
import { SecurityModule } from './security/security.module.js';

@Module({
  imports: [DatabaseModule, AuthModule, BalanceModule, SecurityModule],
})
export class ApiModule {}
