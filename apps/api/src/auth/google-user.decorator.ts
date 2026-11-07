import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '@app/common';

/** `@UseGuards(AuthGuard('google'))` 라우트에서 GoogleStrategy.validate()가 반환한 User를 받음 */
export const GoogleUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User =>
    ctx.switchToHttp().getRequest<Request>().user as User,
);
