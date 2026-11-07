import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule, Oauth, Token, User } from '@app/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { GoogleStrategy } from './google.strategy.js';
import { JwtStrategy } from './jwt.strategy.js';
import {
  RefreshTokenContext,
  RefreshTokenContextMiddleware,
} from './refresh-token.context.js';
import { RefreshTokenGuard } from './refresh-token.guard.js';
import { TokenProvider } from './token.provider.js';

@Module({
  imports: [
    CommonModule,
    PassportModule,
    // access/refresh의 secret·만료가 서로 달라서 TokenProvider에서 호출마다 지정
    JwtModule.register({}),
    TypeOrmModule.forFeature([Oauth, User, Token]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenProvider,
    GoogleStrategy,
    JwtStrategy,
    RefreshTokenContext,
    RefreshTokenGuard,
  ],
  // 다른 업무 모듈에서도 @UseGuards(RefreshTokenGuard) + RefreshTokenContext.getSub() 사용 가능
  exports: [TokenProvider, RefreshTokenContext, RefreshTokenGuard],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RefreshTokenContextMiddleware).forRoutes('*path');
  }
}
