import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { LessThan, Repository } from 'typeorm';
import { authConfig } from '../config/auth.config.js';
import { Token } from './token.entity.js';

export interface TokenPayload {
  /** User.id */
  sub: number;
}

/**
 * JWT 발급·검증과 만료된 로그인 세션(Token 행) 정리. api(로그인)와 batch(expired-tokens 잡)가 함께 쓴다.
 * access token과 refresh token은 서로 다른 secret으로 서명
 */
@Injectable()
export class TokenProvider {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
  ) {}

  createAccessToken(userId: number): Promise<string> {
    const payload: TokenPayload = { sub: userId };
    return this.jwtService.signAsync(payload, {
      secret: this.auth.jwtAccessSecret,
      expiresIn: this.auth.jwtAccessExpiresIn,
    });
  }

  createRefreshToken(userId: number): Promise<string> {
    const payload: TokenPayload = { sub: userId };
    return this.jwtService.signAsync(payload, {
      secret: this.auth.jwtRefreshSecret,
      expiresIn: this.auth.jwtRefreshExpiresIn,
      jwtid: randomUUID(),
    });
  }

  async verifyRefreshToken(refreshToken: string): Promise<TokenPayload> {
    try {
      return await this.jwtService.verifyAsync<TokenPayload>(refreshToken, {
        secret: this.auth.jwtRefreshSecret,
      });
    } catch {
      throw new UnauthorizedException('유효하지 않은 refresh token입니다.');
    }
  }

  /**
   * refresh token이 만료된 로그인 세션(Token 행)을 삭제.
   * 발급·재발급할 때마다 행이 갱신되므로 updatedAt + refresh 만료 기간(JWT_REFRESH_EXPIRES_IN)이 지난 행은
   * refresh token도 이미 만료됐다
   */
  async deleteExpiredRefreshTokens(): Promise<{ deleted: number }> {
    const expiredBefore = new Date(
      Date.now() - this.auth.jwtRefreshExpiresIn * 1000,
    );
    const result = await this.tokenRepository.delete({
      updatedAt: LessThan(expiredBefore),
    });
    return { deleted: result.affected ?? 0 };
  }
}
