import type { Request } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';

export const OAUTH_STATE_COOKIE = 'oauthState';
/** Google 로그인을 시작하고 돌아오기까지 허용하는 시간 */
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

type StoreCallback = (err: Error | null, state?: string) => void;
type VerifyCallback = (
  err: Error | null,
  ok: boolean,
  info?: { message: string },
) => void;

/**
 * Google OAuth state 저장소 (로그인 CSRF 방지). passport-oauth2의 state store 인터페이스를 쿠키로 구현한다
 * (이 앱은 express-session이 없어서 기본 세션 저장소를 못 씀).
 * - store: GET /auth/google에서 임의의 state를 만들어 httpOnly 쿠키에 넣고 Google 인증 URL의 state로 보낸다
 * - verify: callback의 state 쿼리가 쿠키 값과 같은지 확인하고 쿠키를 지운다. 다르거나 없으면 인증 실패(401)
 * SameSite=Lax 쿠키는 Google에서 돌아오는 최상위 GET 이동에 실리므로 callback에서 읽힌다.
 * 메서드 인자 개수(arity)로 passport가 호출 형태를 정하므로 store는 2개, verify는 3개를 유지한다.
 */
export class OAuthStateStore {
  store(req: Request, callback: StoreCallback): void {
    const state = randomBytes(24).toString('base64url');
    req.res!.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth/google',
      maxAge: STATE_MAX_AGE_MS,
    });
    callback(null, state);
  }

  verify(req: Request, providedState: unknown, callback: VerifyCallback): void {
    const expected = req.cookies?.[OAUTH_STATE_COOKIE] as string | undefined;
    req.res?.clearCookie(OAUTH_STATE_COOKIE, { path: '/auth/google' });
    if (!expected || typeof providedState !== 'string' || !sameString(expected, providedState)) {
      callback(null, false, { message: 'OAuth state가 일치하지 않습니다.' });
      return;
    }
    callback(null, true);
  }
}

/** 길이가 달라도 예외 없이, 같은 길이면 상수 시간으로 비교 */
function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
