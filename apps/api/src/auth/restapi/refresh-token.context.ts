import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NestMiddleware,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import { authConfig } from '@app/common';

export const REFRESH_TOKEN_COOKIE = 'refreshToken';

interface RefreshTokenStore {
  res: Response;
  /** RefreshTokenGuard 통과 후 채워짐 */
  refreshToken?: string;
  /** refresh token의 sub (= User.id). RefreshTokenGuard 통과 후 채워짐 */
  sub?: number;
}

const storage = new AsyncLocalStorage<RefreshTokenStore>();

/** 요청마다 context를 연다. AuthModule에서 모든 라우트에 적용 */
@Injectable()
export class RefreshTokenContextMiddleware implements NestMiddleware {
  use(_req: Request, res: Response, next: NextFunction): void {
    storage.run({ res }, next);
  }
}

/**
 * 현재 요청의 refresh token 정보와 cookie 설정.
 * `getRefreshToken()`/`getSub()`는 `@UseGuards(RefreshTokenGuard)`가 붙은 라우트에서만 사용 가능
 */
@Injectable()
export class RefreshTokenContext {
  constructor(
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  getRefreshToken(): string {
    const { refreshToken } = this.store();
    if (refreshToken === undefined) {
      throw new InternalServerErrorException(
        'refresh token context가 없습니다. 라우트에 RefreshTokenGuard를 적용하세요.',
      );
    }
    return refreshToken;
  }

  getSub(): number {
    const { sub } = this.store();
    if (sub === undefined) {
      throw new InternalServerErrorException(
        'refresh token context가 없습니다. 라우트에 RefreshTokenGuard를 적용하세요.',
      );
    }
    return sub;
  }

  /** RefreshTokenGuard에서 호출 */
  set(refreshToken: string, sub: number): void {
    const store = this.store();
    store.refreshToken = refreshToken;
    store.sub = sub;
  }

  /** 현재 요청의 응답에 refresh token cookie를 설정 */
  setRefreshTokenCookie(refreshToken: string): void {
    this.store().res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth',
      maxAge: this.auth.jwtRefreshExpiresIn * 1000,
    });
  }

  private store(): RefreshTokenStore {
    const store = storage.getStore();
    if (!store) {
      throw new InternalServerErrorException(
        'request context가 없습니다. RefreshTokenContextMiddleware가 적용되지 않았습니다.',
      );
    }
    return store;
  }
}
