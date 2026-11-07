import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule, Oauth, Token, User } from '@app/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { GoogleStrategy } from './google-strategy.guard.js';
import { JwtStrategy } from './jwt.strategy.js';
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
  providers: [AuthService, TokenProvider, GoogleStrategy, JwtStrategy],
})
export class AuthModule {}
