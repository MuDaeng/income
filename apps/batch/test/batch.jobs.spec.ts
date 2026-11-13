import { Logger } from '@nestjs/common';
import type {
  ExchangeRateService,
  SecurityImportService,
  UsDailyPriceImportService,
} from '@app/core';
import { DOMESTIC_MARKETS, OVERSEAS_MARKETS } from '@app/core';
import { BATCH_TIME_ZONE, BatchJobs } from '../src/batch.jobs.js';

/** @Cron이 남기는 메타데이터 (@nestjs/schedule 내부 키) */
const cronOf = (method: keyof BatchJobs) => {
  const target = BatchJobs.prototype[method];
  const keys = Reflect.getMetadataKeys(target) as string[];
  const options = keys
    .map((key) => Reflect.getMetadata(key, target) as unknown)
    .find(
      (value): value is { cronTime: string; timeZone: string; name: string } =>
        typeof value === 'object' && value !== null && 'cronTime' in value,
    );
  return options;
};

describe('BatchJobs', () => {
  const importFromMassive = vi.fn();
  const importFromToss = vi.fn();
  const importUsFromMassive = vi.fn();
  let jobs: BatchJobs;
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    jobs = new BatchJobs(
      { importFromMassive } as unknown as ExchangeRateService,
      { importFromToss } as unknown as SecurityImportService,
      {
        importFromMassive: importUsFromMassive,
      } as unknown as UsDailyPriceImportService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('잡마다 한국 시간 일정이 붙어 있다 (환율 16시, 국내 17시, 해외 8시, 미국 시세 15시)', () => {
    expect(cronOf('importExchangeRates')).toMatchObject({
      cronTime: '0 16 * * *',
      timeZone: BATCH_TIME_ZONE,
      name: 'exchange-rates',
    });
    expect(cronOf('importDomesticSecurities')).toMatchObject({
      cronTime: '0 17 * * *',
      timeZone: 'Asia/Seoul',
    });
    expect(cronOf('importOverseasSecurities')).toMatchObject({
      cronTime: '0 8 * * *',
      timeZone: 'Asia/Seoul',
    });
    expect(cronOf('importUsDailyPrices')).toMatchObject({
      cronTime: '0 15 * * *',
      timeZone: 'Asia/Seoul',
      name: 'us-daily-prices',
    });
  });

  it('환율은 오늘(UTC)까지 최근 7일을 가져온다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-13T07:00:00Z')); // 한국 16:00
    importFromMassive.mockResolvedValue({ total: 5 });

    await expect(jobs.importExchangeRates()).resolves.toBe(true);
    expect(importFromMassive).toHaveBeenCalledWith({
      from: '2026-11-06',
      to: '2026-11-13',
    });
  });

  it.each([
    // 한국 11-13 15:00 = 미국 동부 11-13 01:00
    ['서머타임 아님', '2026-11-13T06:00:00Z', '2026-11-05', '2026-11-12'],
    // 한국 07-14 15:00 = 미국 동부 07-14 02:00
    ['서머타임', '2026-07-14T06:00:00Z', '2026-07-06', '2026-07-13'],
  ])('미국 시세는 미국 동부 기준 어제까지 최근 7일을 가져온다 (%s)', async (_, now, from, to) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(now));
    importUsFromMassive.mockResolvedValue({ saved: 52_000 });

    await expect(jobs.importUsDailyPrices()).resolves.toBe(true);
    expect(importUsFromMassive).toHaveBeenCalledWith({ from, to });
    expect(importFromMassive).not.toHaveBeenCalled();
  });

  it('국내·해외 종목은 각자 시장만 가져온다', async () => {
    importFromToss.mockResolvedValue({ total: 1, markets: {} });

    await jobs.importDomesticSecurities();
    await jobs.importOverseasSecurities();

    expect(importFromToss.mock.calls).toEqual([
      [DOMESTIC_MARKETS],
      [OVERSEAS_MARKETS],
    ]);
  });

  it('실패해도 예외를 던지지 않고 로그를 남긴 뒤 false', async () => {
    importFromToss.mockRejectedValue(
      new Error('Toss 종목 목록(KOSPI) 실패: 403'),
    );

    await expect(jobs.importDomesticSecurities()).resolves.toBe(false);
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('[domestic-securities] 실패'),
      expect.any(String),
    );
  });

  it('runByName은 이름에 맞는 잡을 실행한다', async () => {
    importFromToss.mockResolvedValue({ total: 0, markets: {} });

    await jobs.runByName('overseas-securities');

    expect(importFromToss).toHaveBeenCalledWith(OVERSEAS_MARKETS);
    expect(importFromMassive).not.toHaveBeenCalled();
  });
});
