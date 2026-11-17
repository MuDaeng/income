import { Logger } from '@nestjs/common';
import {
  BatchStatus,
  DOMESTIC_MARKETS,
  type DomesticDailyPriceFetcher,
  OVERSEAS_MARKETS,
  type BatchHistoryWriter,
  type ExchangeRateFetcher,
  type SecurityFetcher,
  type TokenProvider,
  type UsDailyPriceFetcher,
} from '@app/common';
import { BATCH_TIME_ZONE, BatchJobs } from '../../src/scheduler/batch.jobs.js';

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
  const importFromDataGoKr = vi.fn();
  const deleteExpiredRefreshTokens = vi.fn();
  const start = vi.fn();
  const finish = vi.fn();
  const HISTORY = { id: 1, name: 'job' };
  let jobs: BatchJobs;
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    jobs = new BatchJobs(
      { importFromMassive } as unknown as ExchangeRateFetcher,
      { importFromToss } as unknown as SecurityFetcher,
      {
        importFromMassive: importUsFromMassive,
      } as unknown as UsDailyPriceFetcher,
      { importFromDataGoKr } as unknown as DomesticDailyPriceFetcher,
      { deleteExpiredRefreshTokens } as unknown as TokenProvider,
      { start, finish } as unknown as BatchHistoryWriter,
    );
    start.mockResolvedValue(HISTORY);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('잡마다 한국 시간 일정이 붙어 있다 (환율 16시, 국내 17시, 해외 8시, 미국 시세 14시 30분, 국내 시세 13시 30분)', () => {
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
      cronTime: '30 14 * * *',
      timeZone: 'Asia/Seoul',
      name: 'us-daily-prices',
    });
    expect(cronOf('importDomesticDailyPrices')).toMatchObject({
      cronTime: '30 13 * * *',
      timeZone: 'Asia/Seoul',
      name: 'domestic-daily-prices',
    });
    expect(cronOf('deleteExpiredTokens')).toMatchObject({
      cronTime: '0 0 * * *',
      timeZone: 'Asia/Seoul',
      name: 'expired-tokens',
    });
  });

  it('자정 잡은 만료된 refresh token 행을 삭제한다 (--run=expired-tokens로도 실행)', async () => {
    deleteExpiredRefreshTokens.mockResolvedValue({ deleted: 3 });

    await expect(jobs.deleteExpiredTokens()).resolves.toBe(true);
    await expect(jobs.runByName('expired-tokens')).resolves.toBe(true);
    expect(deleteExpiredRefreshTokens).toHaveBeenCalledTimes(2);
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
    // 한국 11-13 14:30 = 미국 동부 11-13 00:30
    ['서머타임 아님', '2026-11-13T05:30:00Z', '2026-11-05', '2026-11-12'],
    // 한국 07-14 14:30 = 미국 동부 07-14 01:30
    ['서머타임', '2026-07-14T05:30:00Z', '2026-07-06', '2026-07-13'],
  ])('미국 시세는 미국 동부 기준 어제(방금 끝난 거래일)까지 최근 7일을 가져온다 (%s)', async (_, now, from, to) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(now));
    importUsFromMassive.mockResolvedValue({ saved: 52_000 });

    await expect(jobs.importUsDailyPrices()).resolves.toBe(true);
    expect(importUsFromMassive).toHaveBeenCalledWith({ from, to });
    expect(importFromMassive).not.toHaveBeenCalled();
  });

  it('국내 시세는 한국 시간 오늘부터 4일 전까지 가져온다 (--run=domestic-daily-prices로도 실행)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-17T04:30:00Z')); // 한국 13:30
    importFromDataGoKr.mockResolvedValue({ saved: 12_000 });

    await expect(jobs.importDomesticDailyPrices()).resolves.toBe(true);
    await expect(jobs.runByName('domestic-daily-prices')).resolves.toBe(true);
    expect(importFromDataGoKr.mock.calls).toEqual([
      [{ from: '2026-11-13', to: '2026-11-17' }],
      [{ from: '2026-11-13', to: '2026-11-17' }],
    ]);
    expect(start).toHaveBeenCalledWith('domestic-daily-prices');
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

  it('성공하면 잡 이름으로 이력을 시작하고 결과 JSON과 함께 SUCCESS로 끝낸다', async () => {
    deleteExpiredRefreshTokens.mockResolvedValue({ deleted: 3 });

    await jobs.deleteExpiredTokens();

    expect(start).toHaveBeenCalledWith('expired-tokens');
    expect(finish).toHaveBeenCalledWith(
      HISTORY,
      BatchStatus.SUCCESS,
      '{"deleted":3}',
    );
  });

  it('실패하면 에러 메시지와 함께 FAILED로 끝낸다', async () => {
    importFromToss.mockRejectedValue(new Error('403'));

    await jobs.importOverseasSecurities();

    expect(start).toHaveBeenCalledWith('overseas-securities');
    expect(finish).toHaveBeenCalledWith(HISTORY, BatchStatus.FAILED, '403');
  });

  it('잡 결과가 undefined면 result는 null', async () => {
    deleteExpiredRefreshTokens.mockResolvedValue(undefined);

    await expect(jobs.deleteExpiredTokens()).resolves.toBe(true);
    expect(finish).toHaveBeenCalledWith(HISTORY, BatchStatus.SUCCESS, null);
  });

  it('runByName은 이름에 맞는 잡을 실행한다', async () => {
    importFromToss.mockResolvedValue({ total: 0, markets: {} });

    await jobs.runByName('overseas-securities');

    expect(importFromToss).toHaveBeenCalledWith(OVERSEAS_MARKETS);
    expect(importFromMassive).not.toHaveBeenCalled();
  });
});
