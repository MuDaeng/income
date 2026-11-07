import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './jwt.strategy.js';

/** `@UseGuards(AuthGuard('jwt'))` 라우트에서 Bearer access token의 사용자(`{ id }`)를 받음 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<Request>().user as AuthUser,
);
