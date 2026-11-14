import {
  Controller,
  Get,
  HttpCode,
  Post,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { User } from '@app/common';
import { AUTH_THROTTLE } from '../rate-limit.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { GoogleUser } from './google-user.decorator.js';
import type { AuthUser } from './jwt.strategy.js';
import { REFRESH_TOKEN_COOKIE } from './refresh-token.context.js';
import { RefreshTokenGuard } from './refresh-token.guard.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('google')
  @Throttle(AUTH_THROTTLE)
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google 로그인 시작 (Google 로그인 페이지로 리다이렉트)' })
  googleLogin(): void {
    // AuthGuard('google')가 Google 로그인 페이지로 리다이렉트하므로 본문은 실행되지 않음
  }

  @Get('google/callback')
  @Throttle(AUTH_THROTTLE)
  @UseGuards(AuthGuard('google'))
  @Redirect()
  @ApiOperation({
    summary:
      'Google 로그인 callback: refresh token을 cookie에 담고 프론트엔드 /auth/callback으로 리다이렉트',
  })
  googleCallback(@GoogleUser() user: User): Promise<{ url: string }> {
    return this.authService.loginWithOauth(user);
  }

  @Post('access')
  @Throttle(AUTH_THROTTLE)
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
  @Throttle(AUTH_THROTTLE)
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
  me(@CurrentUser() user: AuthUser): Promise<User> {
    return this.authService.getMe(user);
  }
}
