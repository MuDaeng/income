import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { AuthService } from '../src/auth/auth.service.js';
import { RefreshTokenGuard } from '../src/auth/refresh-token.guard.js';
import { DailySecurityController } from '../src/security/daily-security.controller.js';
import { DailySecurityService } from '../src/security/daily-security.service.js';
import { THROTTLER_OPTIONS } from '../src/rate-limit.js';

/** ApiModule과 같은 ThrottlerModule + 전역 ThrottlerGuard로 컨트롤러만 띄워 한도를 확인 */
describe('요청 속도 제한', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot(THROTTLER_OPTIONS)],
      controllers: [AuthController, DailySecurityController],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        {
          provide: AuthService,
          useValue: { issueAccessToken: () => Promise.resolve({ accessToken: 't' }) },
        },
        {
          provide: DailySecurityService,
          useValue: { getDailyPrices: () => Promise.resolve({ prices: [] }) },
        },
      ],
    })
      .overrideGuard(RefreshTokenGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const hit = async (times: number, send: () => request.Test) => {
    const codes: number[] = [];
    for (let i = 0; i < times; i++) {
      codes.push((await send()).status);
    }
    return codes;
  };

  it('POST /auth/access는 분당 10회까지, 11번째는 429', async () => {
    const codes = await hit(11, () => request(app.getHttpServer()).post('/auth/access'));

    expect(codes.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(codes[10]).toBe(429);
  });

  it('GET /daily-securities는 분당 30회까지, 31번째는 429', async () => {
    const codes = await hit(31, () =>
      request(app.getHttpServer()).get('/daily-securities?securityId=KR7005930003'),
    );

    expect(codes.slice(0, 30)).toEqual(Array(30).fill(200));
    expect(codes[30]).toBe(429);
  });
});
