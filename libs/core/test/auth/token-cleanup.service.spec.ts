import { LessThan } from 'typeorm';
import { TokenCleanupService } from '../../src/auth/token-cleanup.service.js';

describe('TokenCleanupService.deleteExpiredRefreshTokens', () => {
  const REFRESH_EXPIRES_IN = 1_209_600; // 14일

  afterEach(() => {
    vi.useRealTimers();
  });

  it('updatedAt이 refresh 만료 기간보다 오래된 행을 모두 삭제하고 삭제 수를 돌려준다', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-14T15:00:00Z'), toFake: ['Date'] });
    const tokenRepository = { delete: vi.fn().mockResolvedValue({ affected: 3 }) };
    const service = new TokenCleanupService(
      tokenRepository as never,
      { jwtRefreshExpiresIn: REFRESH_EXPIRES_IN } as never,
    );

    await expect(service.deleteExpiredRefreshTokens()).resolves.toEqual({ deleted: 3 });
    expect(tokenRepository.delete).toHaveBeenCalledWith({
      updatedAt: LessThan(new Date('2026-10-31T15:00:00Z')),
    });
  });

  it('affected를 모르면 0', async () => {
    const tokenRepository = { delete: vi.fn().mockResolvedValue({}) };
    const service = new TokenCleanupService(
      tokenRepository as never,
      { jwtRefreshExpiresIn: REFRESH_EXPIRES_IN } as never,
    );

    await expect(service.deleteExpiredRefreshTokens()).resolves.toEqual({ deleted: 0 });
  });
});
