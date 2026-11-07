import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  InternalServerErrorException,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import { authConfig } from '@app/common';
import { TokenProvider } from './token.provider.js';

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

/** cookie의 refresh token을 검증(만료 포함)하고 sub를 RefreshTokenContext에 저장. 없거나 유효하지 않으면 401 */
@Injectable()
export class RefreshTokenGuard implements CanActivate {
  constructor(
    private readonly tokenProvider: TokenProvider,
    private readonly refreshTokenContext: RefreshTokenContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as
      | string
      | undefined;
    if (!refreshToken) {
      throw new UnauthorizedException('refresh token이 없습니다.');
    }
    const { sub } = await this.tokenProvider.verifyRefreshToken(refreshToken);
    this.refreshTokenContext.set(refreshToken, sub);
    return true;
  }
}
