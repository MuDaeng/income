import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { authConfig, type TokenPayload } from '@app/common';

export interface AuthUser {
  id: number;
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
    return { id: payload.sub };
  }
}
