import { Currency, DailySecurity, Security, SecurityType } from '@app/common';
import type { Repository } from 'typeorm';
import type { TossClient } from '../clients/toss/toss.client.js';
import type { TossListedStock, TossMarket } from '../clients/toss/toss.types.js';
import { SecurityService } from './security.service.js';

const stock = (
  isinCode: string,
  name: string,
  securityType: TossListedStock['securityType'] = 'STOCK',
): TossListedStock => ({
  symbol: isinCode.slice(-6),
  name,
  securityType,
  isCommonShare: true,
  isinCode,
});

describe('SecurityService.importFromToss', () => {
  const upsert = vi.fn();
  const listStocks = vi.fn<(market: TossMarket) => Promise<TossListedStock[]>>();
  let service: SecurityService;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    service = new SecurityService(
      { upsert } as unknown as Repository<Security>,
      {} as Repository<DailySecurity>,
      { listStocks } as unknown as TossClient,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const run = async () => {
    const promise = service.importFromToss();
    await vi.runAllTimersAsync();
    return promise;
  };

  it('시장별 통화·유형을 매핑하고 shortenedName은 한글 이름과 같게 upsert한다', async () => {
    const byMarket: Partial<Record<TossMarket, TossListedStock[]>> = {
      KOSPI: [stock('KR7005930003', '삼성전자'), stock('KR7069500007', 'KODEX 200', 'ETF')],
      KOSDAQ: [stock('KR7247540008', '에코프로비엠')],
      NASDAQ: [stock('US0378331005', '애플')],
      NYSE: [stock('US78462F1030', 'SPDR S&P 500', 'FOREIGN_ETF')],
      AMEX: [],
    };
    listStocks.mockImplementation((market) => Promise.resolve(byMarket[market] ?? []));

    const result = await run();

    expect(listStocks.mock.calls.map(([market]) => market)).toEqual([
      'KOSPI',
      'KOSDAQ',
      'NYSE',
      'NASDAQ',
      'AMEX',
    ]);
    expect(result).toEqual({
      total: 5,
      markets: { KOSPI: 2, KOSDAQ: 1, NYSE: 1, NASDAQ: 1, AMEX: 0 },
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    const [rows, conflict] = upsert.mock.calls[0] as [Partial<Security>[], string[]];
    expect(conflict).toEqual(['id']);
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          id: 'KR7005930003',
          type: SecurityType.STOCK,
          name: '삼성전자',
          shortenedName: '삼성전자',
          symbol: '930003',
          currency: Currency.KRW,
        },
        expect.objectContaining({ id: 'KR7069500007', type: SecurityType.ETF, currency: Currency.KRW }),
        expect.objectContaining({ id: 'US0378331005', currency: Currency.USD }),
        expect.objectContaining({ id: 'US78462F1030', type: SecurityType.FOREIGN_ETF, currency: Currency.USD }),
      ]),
    );
  });

  it('같은 ISIN은 한 번만 넣고, 1,000건씩 나눠 upsert한다', async () => {
    const many = Array.from({ length: 2_300 }, (_, i) =>
      stock(`US${String(i).padStart(10, '0')}`, `종목${i}`),
    );
    listStocks.mockImplementation((market) =>
      Promise.resolve(market === 'NASDAQ' ? many : market === 'NYSE' ? many.slice(0, 10) : []),
    );

    const result = await run();

    expect(result.total).toBe(2_300);
    expect(upsert.mock.calls.map(([rows]) => (rows as unknown[]).length)).toEqual([
      1_000, 1_000, 300,
    ]);
  });
});
