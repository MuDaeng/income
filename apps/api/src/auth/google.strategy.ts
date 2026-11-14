import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
import type { StateStore } from 'passport-oauth2';
import { authConfig, OAuthType, User } from '@app/common';
import { AuthService } from './auth.service.js';
import { OAuthStateStore } from './oauth-state.store.js';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    @Inject(authConfig.KEY) auth: ConfigType<typeof authConfig>,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: auth.googleClientId!,
      clientSecret: auth.googleClientSecret!,
      callbackURL: auth.googleCallbackUrl!,
      scope: ['email', 'profile'],
      // state 쿠키로 callback이 이 브라우저에서 시작한 로그인인지 확인 (로그인 CSRF 방지)
      // 타입 정의는 store·verify를 오버로드로 선언하지만, passport는 인자 개수로 호출 형태를 고르므로 2·3개짜리 구현을 그대로 넘김
      store: new OAuthStateStore() as unknown as StateStore,
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): Promise<User> {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new UnauthorizedException('Google 계정에 이메일이 없습니다.');
    }
    return this.authService.findOrCreateOauthUser(OAuthType.GOOGLE, email);
  }
}
