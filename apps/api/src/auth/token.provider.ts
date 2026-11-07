import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { authConfig } from '@app/common';

export interface TokenPayload {
  /** User.id */
  sub: number;
}

/** access token과 refresh token은 서로 다른 secret으로 서명 */
@Injectable()
export class TokenProvider {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
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
}
