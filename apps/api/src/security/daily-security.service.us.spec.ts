import { Currency, DailySecurity, Security } from '@app/common';
import type { Repository } from 'typeorm';
import type {
  DataGoKrClient,
  MassiveClient,
  MassiveGroupedBar,
} from '@app/core';
import { DailySecurityService } from './daily-security.service.js';
import type { SecurityRefreshService } from './security-refresh.service.js';

const bar = (T: string, c = 190.1234567): MassiveGroupedBar => ({
  T,
  o: 188.5,
  h: 191.25,
  l: 187.9999999,
  c,
  t: 0,
});

describe('DailySecurityService.importUsFromMassive', () => {
  const upsert = vi.fn();
  const find = vi.fn();
  const getGroupedDailyStocks = vi.fn<(date: string) => Promise<MassiveGroupedBar[]>>();
  let service: DailySecurityService;

  beforeEach(() => {
    vi.resetAllMocks();
    find.mockResolvedValue([
      { id: 'US0378331005', symbol: 'AAPL' },
      { id: 'US0605056821', symbol: 'BAC-P' },
      { id: 'US0846707026', symbol: 'BRK.B' },
    ]);
    getGroupedDailyStocks.mockResolvedValue([]);
    service = new DailySecurityService(
      { upsert } as unknown as Repository<DailySecurity>,
      { find } as unknown as Repository<Security>,
      {} as DataGoKrClient,
      { getGroupedDailyStocks } as unknown as MassiveClient,
      {} as SecurityRefreshService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('주말을 건너뛰고 거래일마다 한 번 호출해, USD 종목만 티커로 맞춰 6자리 버림으로 upsert한다', async () => {
    getGroupedDailyStocks.mockImplementation((date) =>
      Promise.resolve(
        date === '2026-11-06'
          ? [bar('AAPL'), bar('BACpP', 25), bar('BRK.B', 480), bar('ZZZZ')]
          : [],
      ),
    );

    // 2026-11-06(금) ~ 11-09(월)
    const result = await service.importUsFromMassive({
      from: '2026-11-06',
      to: '2026-11-09',
    });

    expect(find).toHaveBeenCalledWith({
      select: { id: true, symbol: true },
      where: { currency: Currency.USD },
    });
    expect(getGroupedDailyStocks.mock.calls.map(([date]) => date)).toEqual([
      '2026-11-06',
      '2026-11-09',
    ]);
    expect(upsert).toHaveBeenCalledTimes(1);
    const [rows, conflict] = upsert.mock.calls[0] as [Partial<DailySecurity>[], string[]];
    expect(conflict).toEqual(['id', 'date']);
    expect(rows).toEqual([
      {
        id: 'US0378331005',
        date: '2026-11-06',
        openingPrice: '188.500000',
        closingPrice: '190.123456',
        highestPrice: '191.250000',
        lowestPrice: '187.999999',
      },
      expect.objectContaining({ id: 'US0605056821', closingPrice: '25.000000' }),
      expect.objectContaining({ id: 'US0846707026', closingPrice: '480.000000' }),
    ]);
    expect(result).toEqual({
      from: '2026-11-06',
      to: '2026-11-09',
      fetched: 4,
      saved: 3,
      skipped: 1,
      firstDate: '2026-11-06',
      lastDate: '2026-11-06',
    });
  });

  it('기간을 생략하면 오늘까지 최근 2년을 받는다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-08T03:00:00Z'));

    const result = await service.importUsFromMassive({});

    const dates = getGroupedDailyStocks.mock.calls.map(([date]) => date);
    expect(dates[0]).toBe('2024-11-08');
    expect(dates.at(-1)).toBe('2026-11-06'); // 11-07·08은 주말
    expect(upsert).not.toHaveBeenCalled();
    expect(result).toMatchObject({ from: '2024-11-08', to: '2026-11-08', saved: 0 });
  });
});
