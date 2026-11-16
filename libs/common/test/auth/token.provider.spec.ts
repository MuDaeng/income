import { LessThan } from 'typeorm';
import { TokenProvider } from '../../src/auth/token.provider.js';
import { Rule } from '../../src/user/rule.enum.js';

describe('TokenProvider.deleteExpiredRefreshTokens', () => {
  const REFRESH_EXPIRES_IN = 1_209_600; // 14일

  const providerWith = (tokenRepository: unknown) =>
    new TokenProvider(
      {} as never,
      { jwtRefreshExpiresIn: REFRESH_EXPIRES_IN } as never,
      tokenRepository as never,
      {} as never,
    );

  afterEach(() => {
    vi.useRealTimers();
  });

  it('updatedAt이 refresh 만료 기간보다 오래된 행을 모두 삭제하고 삭제 수를 돌려준다', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-14T15:00:00Z'), toFake: ['Date'] });
    const tokenRepository = { delete: vi.fn().mockResolvedValue({ affected: 3 }) };

    await expect(
      providerWith(tokenRepository).deleteExpiredRefreshTokens(),
    ).resolves.toEqual({ deleted: 3 });
    expect(tokenRepository.delete).toHaveBeenCalledWith({
      updatedAt: LessThan(new Date('2026-10-31T15:00:00Z')),
    });
  });

  it('affected를 모르면 0', async () => {
    const tokenRepository = { delete: vi.fn().mockResolvedValue({}) };

    await expect(
      providerWith(tokenRepository).deleteExpiredRefreshTokens(),
    ).resolves.toEqual({ deleted: 0 });
  });
});

describe('TokenProvider.createAccessToken', () => {
  it('그 사용자의 UserRule 목록을 rules로 payload에 넣는다', async () => {
    const signAsync = vi.fn().mockResolvedValue('signed');
    const find = vi.fn().mockResolvedValue([
      { id: 5, rule: Rule.USER },
      { id: 5, rule: Rule.ADMIN },
    ]);
    const provider = new TokenProvider(
      { signAsync } as never,
      { jwtAccessSecret: 'secret', jwtAccessExpiresIn: 900 } as never,
      {} as never,
      { find } as never,
    );

    await expect(provider.createAccessToken(5)).resolves.toBe('signed');
    expect(find).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(signAsync).toHaveBeenCalledWith(
      { sub: 5, rules: [Rule.USER, Rule.ADMIN] },
      { secret: 'secret', expiresIn: 900 },
    );
  });
});
