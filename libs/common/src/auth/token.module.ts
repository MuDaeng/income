import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { authConfig } from '../config/auth.config.js';
import { User } from '../user/user.entity.js';
import { Token } from './token.entity.js';
import { TokenProvider } from './token.provider.js';

/**
 * TokenProvider(JWT 발급·검증, 만료 세션 정리) 모듈. api의 AuthModule과 batch가 import한다.
 * access/refresh의 secret·만료가 서로 달라서 JwtModule에는 기본값 없이 TokenProvider가 호출마다 지정.
 * Token → User 관계 때문에 User도 등록
 */
@Module({
  imports: [
    ConfigModule.forFeature(authConfig),
    JwtModule.register({}),
    TypeOrmModule.forFeature([Token, User]),
  ],
  providers: [TokenProvider],
  exports: [TokenProvider],
})
export class TokenModule {}
