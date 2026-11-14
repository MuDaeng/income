import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { authConfig, Token, User } from '@app/common';
import { TokenCleanupService } from './token-cleanup.service.js';

/** 만료된 refresh token(로그인 세션) 정리 (batch 일배치). Token → User 관계 때문에 User도 등록 */
@Module({
  imports: [
    ConfigModule.forFeature(authConfig),
    TypeOrmModule.forFeature([Token, User]),
  ],
  providers: [TokenCleanupService],
  exports: [TokenCleanupService],
})
export class TokenCleanupModule {}
