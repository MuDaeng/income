import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Rule } from '@app/common';
import { AdminGuard } from '../../../src/admin/restapi/admin.guard.js';

const contextWith = (user: unknown) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  it('rules에 admin이 있으면 통과한다', () => {
    expect(
      guard.canActivate(contextWith({ id: 1, rules: [Rule.USER, Rule.ADMIN] })),
    ).toBe(true);
  });

  it('user 권한만 있으면 403', () => {
    expect(() =>
      guard.canActivate(contextWith({ id: 1, rules: [Rule.USER] })),
    ).toThrow(ForbiddenException);
  });

  it('권한이 없거나(rules 빈 배열) 사용자가 없으면 403', () => {
    expect(() => guard.canActivate(contextWith({ id: 1, rules: [] }))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
