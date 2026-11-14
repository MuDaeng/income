import type { ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * 요청 속도 제한(@nestjs/throttler). 클라이언트 IP(req.ip, main.ts의 trust proxy로 Nginx 뒤 실제 IP)마다 1분 창.
 * 넘으면 429. 저장소는 메모리라 pm2 프로세스 하나 기준이다.
 */
const MINUTE = 60_000;

/** 모든 라우트 기본 한도: IP당 분당 100회 */
export const THROTTLER_OPTIONS: ThrottlerModuleOptions = [
  { name: 'default', ttl: MINUTE, limit: 100 },
];

/** 로그인·토큰 발급 (/auth/google, /auth/google/callback, /auth/access, /auth/reissue): 분당 10회 */
export const AUTH_THROTTLE = { default: { ttl: MINUTE, limit: 10 } };

/** 로그인 없이 외부 API 갱신을 일으키는 시세 조회 (GET /daily-securities): 분당 30회 */
export const PRICE_THROTTLE = { default: { ttl: MINUTE, limit: 30 } };
