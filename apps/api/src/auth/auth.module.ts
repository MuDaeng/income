import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CommonModule,
  Oauth,
  Token,
  TokenModule,
  User,
  UserRule,
} from '@app/common';
import { AuthController } from './restapi/auth.controller.js';
import { AuthService } from './restapi/auth.service.js';
import { GoogleStrategy } from './restapi/google.strategy.js';
import { JwtStrategy } from './restapi/jwt.strategy.js';
import {
  RefreshTokenContext,
  RefreshTokenContextMiddleware,
} from './restapi/refresh-token.context.js';
import { RefreshTokenGuard } from './restapi/refresh-token.guard.js';

@Module({
  imports: [
    CommonModule,
    PassportModule,
    // JWT 발급·검증(TokenProvider)은 @app/common의 TokenModule
    TokenModule,
    TypeOrmModule.forFeature([Oauth, User, Token, UserRule]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleStrategy,
    JwtStrategy,
    RefreshTokenContext,
    RefreshTokenGuard,
  ],
  // 다른 업무 모듈에서도 @UseGuards(RefreshTokenGuard) + RefreshTokenContext.getSub() 사용 가능
  // (가드가 그 모듈에서 TokenProvider를 찾으므로 TokenModule도 re-export)
  exports: [TokenModule, RefreshTokenContext, RefreshTokenGuard],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RefreshTokenContextMiddleware).forRoutes('*path');
  }
}
