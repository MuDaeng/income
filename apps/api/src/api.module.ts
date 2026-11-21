import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from '@app/common';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BalanceModule } from './balance/balance.module.js';
import { THROTTLER_OPTIONS } from './rate-limit.js';
import { SecurityModule } from './security/security.module.js';
import { UserModule } from './user/user.module.js';

@Module({
  imports: [
    DatabaseModule,
    // 앱 전체 요청 속도 제한 (라우트별 한도는 @Throttle, 값은 rate-limit.ts)
    ThrottlerModule.forRoot(THROTTLER_OPTIONS),
    AuthModule,
    AdminModule,
    BalanceModule,
    SecurityModule,
    UserModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class ApiModule {}
