import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { User } from '@app/common';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google 로그인 시작 (Google 로그인 페이지로 리다이렉트)' })
  googleLogin(): void {
    // AuthGuard('google')가 Google 로그인 페이지로 리다이렉트하므로 본문은 실행되지 않음
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google 로그인 callback' })
  googleCallback(@Req() req: Request): User {
    // GoogleStrategy.validate()가 반환한 User
    return req.user as User;
  }
}
