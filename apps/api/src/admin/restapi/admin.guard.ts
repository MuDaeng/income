import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { Rule } from '@app/common';
import type { AuthUser } from '../../auth/restapi/jwt.strategy.js';

/**
 * access token의 권한(rules)에 admin이 있어야 통과, 없으면 403.
 * req.user는 JwtStrategy가 채우므로 `@UseGuards(AuthGuard('jwt'), AdminGuard)` 순서로 쓴다
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<Request>().user as
      | AuthUser
      | undefined;
    if (!user?.rules?.includes(Rule.ADMIN)) {
      throw new ForbiddenException('관리자만 사용할 수 있습니다.');
    }
    return true;
  }
}
