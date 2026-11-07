import {
  Controller,
  Get,
  HttpCode,
  Post,
  Redirect,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { User } from '@app/common';
import { AuthService } from './auth.service.js';
import type { AuthUser } from './jwt.strategy.js';
import {
  REFRESH_TOKEN_COOKIE,
  RefreshTokenGuard,
} from './refresh-token.context.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google 로그인 시작 (Google 로그인 페이지로 리다이렉트)' })
  googleLogin(): void {
    // AuthGuard('google')가 Google 로그인 페이지로 리다이렉트하므로 본문은 실행되지 않음
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @Redirect()
  @ApiOperation({
    summary:
      'Google 로그인 callback: refresh token을 cookie에 담고 프론트엔드 /auth/callback으로 리다이렉트',
  })
  googleCallback(@Req() req: Request): Promise<{ url: string }> {
    // req.user = GoogleStrategy.validate()가 반환한 User
    return this.authService.loginWithOauth(req.user as User);
  }

  @Post('access')
  @HttpCode(200)
  @UseGuards(RefreshTokenGuard)
  @ApiCookieAuth(REFRESH_TOKEN_COOKIE)
  @ApiOperation({
    summary: '로그인 직후: cookie의 refresh token으로 access token 발급',
  })
  access(): Promise<{ accessToken: string }> {
    return this.authService.issueAccessToken();
  }

  @Post('reissue')
  @HttpCode(200)
  @UseGuards(RefreshTokenGuard)
  @ApiCookieAuth(REFRESH_TOKEN_COOKIE)
  @ApiOperation({
    summary:
      'access token 만료 시 재발급: 두 토큰을 새로 발급, refresh token은 cookie로 교체',
  })
  reissue(): Promise<{ accessToken: string }> {
    return this.authService.reissueTokens();
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bearer access token으로 로그인한 사용자 확인' })
  me(@Req() req: Request): AuthUser {
    return req.user as AuthUser;
  }
}
