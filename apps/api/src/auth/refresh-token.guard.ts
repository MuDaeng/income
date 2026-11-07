import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  REFRESH_TOKEN_COOKIE,
  RefreshTokenContext,
} from './refresh-token.context.js';
import { TokenProvider } from './token.provider.js';

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
