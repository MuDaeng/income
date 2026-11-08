import { Currency, DailyExchangeRate } from '@app/common';
import type { Repository } from 'typeorm';
import type { MassiveClient } from '../massive/massive.client.js';
import type { MassiveAggregateBar } from '../massive/massive.types.js';
import { ExchangeRateService } from './exchange-rate.service.js';

const DAY_MS = 86_400_000;
const utc = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`);

describe('ExchangeRateService.importFromMassive', () => {
  const upsert = vi.fn();
  const getDailyForexBars =
    vi.fn<(ticker: string, from: string, to: string) => Promise<MassiveAggregateBar[]>>();
  let service: ExchangeRateService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new ExchangeRateService(
      { upsert } as unknown as Repository<DailyExchangeRate>,
      { getDailyForexBars } as unknown as MassiveClient,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('C:USDKRW 일봉을 UTC 날짜·USD 행으로, 소수 6자리 버림해 upsert한다', async () => {
    getDailyForexBars.mockResolvedValue([
      { o: 1380.1234567, h: 1390.9999999, l: 1370, c: 1385.5, t: utc('2026-11-05') },
      { o: 1385.5, h: 1392, l: 1381.25, c: 1388.75, t: utc('2026-11-06') },
    ]);

    const result = await service.importFromMassive({
      from: '2026-11-05',
      to: '2026-11-06',
    });

    expect(getDailyForexBars).toHaveBeenCalledWith('C:USDKRW', '2026-11-05', '2026-11-06');
    expect(upsert).toHaveBeenCalledTimes(1);
    const [rows, conflict] = upsert.mock.calls[0] as [Partial<DailyExchangeRate>[], string[]];
    expect(conflict).toEqual(['date', 'currency']);
    expect(rows[0]).toEqual({
      date: '2026-11-05',
      currency: Currency.USD,
      openingRate: '1380.123456',
      closingRate: '1385.5',
      highestRate: '1390.999999',
      lowestRate: '1370',
    });
    expect(rows[1].date).toBe('2026-11-06');
    expect(result).toEqual({
      from: '2026-11-05',
      to: '2026-11-06',
      total: 2,
      firstDate: '2026-11-05',
      lastDate: '2026-11-06',
    });
  });

  it('기간을 생략하면 오늘(UTC)까지 최근 2년을 요청한다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-08T23:30:00Z'));
    getDailyForexBars.mockResolvedValue([]);

    const result = await service.importFromMassive({});

    expect(getDailyForexBars).toHaveBeenCalledWith('C:USDKRW', '2024-11-08', '2026-11-08');
    expect(upsert).not.toHaveBeenCalled();
    expect(result).toEqual({
      from: '2024-11-08',
      to: '2026-11-08',
      total: 0,
      firstDate: null,
      lastDate: null,
    });
  });

  it('1,000건씩 나눠 upsert한다', async () => {
    const start = utc('2020-01-01');
    getDailyForexBars.mockResolvedValue(
      Array.from({ length: 2_300 }, (_, i) => ({ o: 1, h: 1, l: 1, c: 1, t: start + i * DAY_MS })),
    );

    await service.importFromMassive({ from: '2020-01-01', to: '2026-04-18' });

    expect(upsert.mock.calls.map(([rows]) => (rows as unknown[]).length)).toEqual([
      1_000, 1_000, 300,
    ]);
  });
});
