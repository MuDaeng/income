import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { authConfig, User } from '@app/common';
import { AuthService } from './auth.service.js';
import type { AuthUser } from './jwt.strategy.js';

export const REFRESH_TOKEN_COOKIE = 'refreshToken';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google 로그인 시작 (Google 로그인 페이지로 리다이렉트)' })
  googleLogin(): void {
    // AuthGuard('google')가 Google 로그인 페이지로 리다이렉트하므로 본문은 실행되지 않음
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({
    summary:
      'Google 로그인 callback: refresh token을 cookie에 담고 프론트엔드 /auth/callback으로 리다이렉트',
  })
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // GoogleStrategy.validate()가 반환한 User
    const { refreshToken } = await this.authService.issueTokens(
      req.user as User,
    );

    this.setRefreshTokenCookie(res, refreshToken);
    res.redirect(`${this.auth.frontendUrl}/auth/callback`);
  }

  @Post('reissue')
  @HttpCode(200)
  @ApiCookieAuth(REFRESH_TOKEN_COOKIE)
  @ApiOperation({
    summary:
      'access token 만료 시 재발급: refresh token 검증 후 두 토큰을 새로 발급, refresh token은 cookie로 교체',
  })
  async reissue(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const { accessToken, refreshToken } = await this.authService.reissueTokens(
      req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined,
    );
    this.setRefreshTokenCookie(res, refreshToken);
    return { accessToken };
  }

  @Post('access')
  @HttpCode(200)
  @ApiCookieAuth(REFRESH_TOKEN_COOKIE)
  @ApiOperation({ summary: 'cookie의 refresh token으로 access token 발급' })
  async access(@Req() req: Request): Promise<{ accessToken: string }> {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as
      | string
      | undefined;
    const accessToken = await this.authService.reissueAccessToken(refreshToken);
    return { accessToken };
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bearer access token으로 로그인한 사용자 확인' })
  me(@Req() req: Request): AuthUser {
    return req.user as AuthUser;
  }

  private setRefreshTokenCookie(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth',
      maxAge: this.auth.jwtRefreshExpiresIn * 1000,
    });
  }
}
