import { UnauthorizedException } from '@nestjs/common';
import { LessThan } from 'typeorm';
import type { Token, User } from '@app/common';
import { AuthService } from '../../src/auth/auth.service.js';

vi.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

/** 여러 기기 동시 로그인: Token은 세션(기기)당 1행 */
describe('AuthService 세션(기기)별 토큰', () => {
  const REFRESH_EXPIRES_IN = 1_209_600;

  const setup = (stored: Token | null = null) => {
    const tokenRepository = {
      delete: vi.fn().mockResolvedValue({}),
      create: vi.fn((v: Partial<Token>) => v),
      save: vi.fn((v: Partial<Token>) => Promise.resolve(v)),
      findOne: vi.fn().mockResolvedValue(stored),
    };
    let seq = 0;
    const tokenProvider = {
      createAccessToken: vi.fn(() => Promise.resolve(`access-${++seq}`)),
      createRefreshToken: vi.fn(() => Promise.resolve(`refresh-${++seq}`)),
    };
    const context = {
      getRefreshToken: vi.fn(() => 'old-refresh'),
      getSub: vi.fn(() => 7),
      setRefreshTokenCookie: vi.fn(),
    };
    const service = new AuthService(
      {} as never,
      {} as never,
      tokenRepository as never,
      tokenProvider as never,
      context as never,
      { frontendUrl: 'https://front', jwtRefreshExpiresIn: REFRESH_EXPIRES_IN } as never,
    );
    return { service, tokenRepository, context };
  };

  it('로그인: 기존 행을 덮어쓰지 않고 새 행을 추가 (다른 기기 로그인 유지)', async () => {
    const { service, tokenRepository, context } = setup();

    const result = await service.loginWithOauth({ id: 7 } as User);

    expect(tokenRepository.save).toHaveBeenCalledWith({
      userId: 7,
      accessToken: 'access-1',
      refreshToken: 'refresh-2',
    });
    expect(tokenRepository.save.mock.calls[0][0]).not.toHaveProperty('id');
    expect(context.setRefreshTokenCookie).toHaveBeenCalledWith('refresh-2');
    expect(result).toEqual({ url: 'https://front/auth/callback' });
  });

  it('로그인: 이 사용자의 행 중 refresh 만료 기간 동안 갱신 안 된 행만 삭제', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-14T00:00:00Z') });
    const { service, tokenRepository } = setup();

    await service.loginWithOauth({ id: 7 } as User);

    expect(tokenRepository.delete).toHaveBeenCalledWith({
      userId: 7,
      updatedAt: LessThan(
        new Date(Date.parse('2026-11-14T00:00:00Z') - REFRESH_EXPIRES_IN * 1000),
      ),
    });
    vi.useRealTimers();
  });

  it('재발급: 요청한 세션의 행만 같은 id로 교체 (다른 행 삭제 없음)', async () => {
    const stored = {
      id: 3,
      userId: 7,
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
    } as Token;
    const { service, tokenRepository, context } = setup(stored);

    const result = await service.reissueTokens();

    expect(tokenRepository.findOne).toHaveBeenCalledWith({
      where: { refreshToken: 'old-refresh' },
    });
    expect(tokenRepository.delete).not.toHaveBeenCalled();
    expect(tokenRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 3,
        userId: 7,
        accessToken: 'access-1',
        refreshToken: 'refresh-2',
      }),
    );
    expect(context.setRefreshTokenCookie).toHaveBeenCalledWith('refresh-2');
    expect(result).toEqual({ accessToken: 'access-1' });
  });

  it('access 발급: refresh token은 그대로, access token만 교체', async () => {
    const stored = {
      id: 3,
      userId: 7,
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
    } as Token;
    const { service, tokenRepository } = setup(stored);

    const result = await service.issueAccessToken();

    expect(tokenRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3, accessToken: 'access-1', refreshToken: 'old-refresh' }),
    );
    expect(result).toEqual({ accessToken: 'access-1' });
  });

  it.each([
    ['테이블에 없음', null],
    ['다른 사용자의 행', { id: 3, userId: 8, refreshToken: 'old-refresh' } as Token],
  ])('재발급: %s이면 401', async (_, stored) => {
    const { service } = setup(stored);

    await expect(service.reissueTokens()).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
