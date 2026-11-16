import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { authConfig, type Rule, type TokenPayload } from '@app/common';

export interface AuthUser {
  id: number;
  /** access token의 권한 (권한이 들어가기 전에 발급된 토큰이면 빈 배열) */
  rules: Rule[];
}

/** `Authorization: Bearer <accessToken>` 검증. 보호할 라우트에 `@UseGuards(AuthGuard('jwt'))` */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(@Inject(authConfig.KEY) auth: ConfigType<typeof authConfig>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: auth.jwtAccessSecret!,
      ignoreExpiration: false,
    });
  }

  validate(payload: TokenPayload): AuthUser {
    return { id: payload.sub, rules: payload.rules ?? [] };
  }
}
