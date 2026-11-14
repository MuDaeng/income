import type { Request } from 'express';
import {
  OAUTH_STATE_COOKIE,
  OAuthStateStore,
} from '../../src/auth/oauth-state.store.js';

const requestWith = (cookies: Record<string, string> = {}) => {
  const res = { cookie: vi.fn(), clearCookie: vi.fn() };
  const req = { cookies, res } as unknown as Request;
  return { req, res };
};

describe('OAuthStateStore', () => {
  const store = new OAuthStateStore();

  it('passport가 인자 개수로 호출 형태를 고르므로 store는 2개, verify는 3개', () => {
    expect(store.store.length).toBe(2);
    expect(store.verify.length).toBe(3);
  });

  it('store: 임의의 state를 httpOnly 쿠키(/auth/google, 10분)에 넣고 같은 값을 돌려준다', () => {
    const { req, res } = requestWith();
    const callback = vi.fn();

    store.store(req, callback);

    const state = callback.mock.calls[0][1] as string;
    expect(callback).toHaveBeenCalledWith(null, expect.any(String));
    expect(state.length).toBeGreaterThanOrEqual(32);
    expect(res.cookie).toHaveBeenCalledWith(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/auth/google',
      maxAge: 600_000,
    });
  });

  it('store: 호출마다 다른 state', () => {
    const first = vi.fn();
    const second = vi.fn();
    store.store(requestWith().req, first);
    store.store(requestWith().req, second);

    expect(first.mock.calls[0][1]).not.toBe(second.mock.calls[0][1]);
  });

  it('verify: 쿠키와 같으면 통과하고 쿠키를 지운다', () => {
    const { req, res } = requestWith({ [OAUTH_STATE_COOKIE]: 'abc123' });
    const callback = vi.fn();

    store.verify(req, 'abc123', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
    expect(res.clearCookie).toHaveBeenCalledWith(OAUTH_STATE_COOKIE, {
      path: '/auth/google',
    });
  });

  it.each([
    ['다른 값', { [OAUTH_STATE_COOKIE]: 'abc123' }, 'abc124'],
    ['길이가 다른 값', { [OAUTH_STATE_COOKIE]: 'abc123' }, 'abc'],
    ['쿠키 없음', {}, 'abc123'],
    ['state 쿼리 없음', { [OAUTH_STATE_COOKIE]: 'abc123' }, undefined],
  ])('verify: %s이면 실패(쿠키는 지움)', (_, cookies, provided) => {
    const { req, res } = requestWith(cookies);
    const callback = vi.fn();

    store.verify(req, provided, callback);

    expect(callback).toHaveBeenCalledWith(null, false, {
      message: 'OAuth state가 일치하지 않습니다.',
    });
    expect(res.clearCookie).toHaveBeenCalled();
  });
});
