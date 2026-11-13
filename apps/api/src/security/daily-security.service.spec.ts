import { Currency, DailySecurity, Security } from '@app/common';
import type { Repository } from 'typeorm';
import type {
  DataGoKrClient,
  PricePage,
  PriceQuery,
  StockPriceItem,
} from '@app/core';
import { DailySecurityService } from './daily-security.service.js';
import type { SecurityRefreshService } from './security-refresh.service.js';

const item = (isinCd: string, basDt: string, clpr = '72000'): StockPriceItem => ({
  basDt,
  srtnCd: isinCd.slice(3, 9),
  isinCd,
  itmsNm: isinCd,
  mrktCtg: 'KOSPI',
  clpr,
  mkp: '71600',
  hipr: '72300',
  lopr: '71500',
});

describe('DailySecurityService.importFromDataGoKr', () => {
  const upsert = vi.fn();
  const find = vi.fn();
  const getStockPrices = vi.fn<(query: PriceQuery) => Promise<PricePage<StockPriceItem>>>();
  let service: DailySecurityService;

  beforeEach(() => {
    vi.resetAllMocks();
    find.mockResolvedValue([{ id: 'KR7005930003' }, { id: 'KR7000660001' }]);
    service = new DailySecurityService(
      { upsert } as unknown as Repository<DailySecurity>,
      { find } as unknown as Repository<Security>,
      { getStockPrices } as unknown as DataGoKrClient,
      {} as SecurityRefreshService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('KRW 종목만 날짜·원화 정수 가격으로 upsert하고, endBasDt는 종료일 다음 날로 보낸다', async () => {
    getStockPrices.mockResolvedValueOnce({
      totalCount: 3,
      items: [
        item('KR7005930003', '20261105', '72000.9'),
        item('KR7000660001', '20261106'),
        item('KR7999999999', '20261106'), // security에 없는 종목
      ],
    });

    const result = await service.importFromDataGoKr({
      from: '2026-11-05',
      to: '2026-11-06',
    });

    expect(find).toHaveBeenCalledWith({
      select: { id: true },
      where: { currency: Currency.KRW },
    });
    expect(getStockPrices).toHaveBeenCalledWith({
      beginBasDt: '20261105',
      endBasDt: '20261107',
      pageNo: 1,
      numOfRows: 10_000,
    });
    const [rows, conflict] = upsert.mock.calls[0] as [Partial<DailySecurity>[], string[]];
    expect(conflict).toEqual(['id', 'date']);
    expect(rows).toEqual([
      {
        id: 'KR7005930003',
        date: '2026-11-05',
        openingPrice: '71600',
        closingPrice: '72000',
        highestPrice: '72300',
        lowestPrice: '71500',
      },
      expect.objectContaining({ id: 'KR7000660001', date: '2026-11-06' }),
    ]);
    expect(result).toEqual({
      from: '2026-11-05',
      to: '2026-11-06',
      fetched: 3,
      saved: 2,
      skipped: 1,
      firstDate: '2026-11-05',
      lastDate: '2026-11-06',
    });
  });

  it('totalCount를 다 받을 때까지 페이지를 넘기고, 페이지마다 1,000건씩 upsert한다', async () => {
    const page = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        item(i % 2 ? 'KR7005930003' : 'KR7000660001', '20261105'),
      );
    getStockPrices
      .mockResolvedValueOnce({ totalCount: 12_500, items: page(10_000) })
      .mockResolvedValueOnce({ totalCount: 12_500, items: page(2_500) });

    const result = await service.importFromDataGoKr({
      from: '2026-01-01',
      to: '2026-11-06',
    });

    expect(getStockPrices.mock.calls.map(([q]) => q.pageNo)).toEqual([1, 2]);
    expect(upsert.mock.calls.map(([rows]) => (rows as unknown[]).length)).toEqual([
      ...Array<number>(10).fill(1_000),
      1_000,
      1_000,
      500,
    ]);
    expect(result.saved).toBe(12_500);
  });

  it('기간을 생략하면 오늘까지 최근 2년을 요청하고, 결과가 없으면 저장하지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-08T03:00:00Z'));
    getStockPrices.mockResolvedValueOnce({ totalCount: 0, items: [] });

    const result = await service.importFromDataGoKr({});

    expect(getStockPrices).toHaveBeenCalledTimes(1);
    expect(getStockPrices.mock.calls[0][0]).toMatchObject({
      beginBasDt: '20241108',
      endBasDt: '20261109',
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(result).toMatchObject({ fetched: 0, saved: 0, firstDate: null, lastDate: null });
  });
});

describe('DailySecurityService.importEtfFromDataGoKr', () => {
  const upsert = vi.fn();
  const find = vi.fn();
  const getEtfPrices = vi.fn<(query: PriceQuery) => Promise<PricePage>>();
  let service: DailySecurityService;

  beforeEach(() => {
    vi.resetAllMocks();
    find.mockResolvedValue([{ id: 'KR7441640000' }]);
    service = new DailySecurityService(
      { upsert } as unknown as Repository<DailySecurity>,
      { find } as unknown as Repository<Security>,
      { getEtfPrices } as unknown as DataGoKrClient,
      {} as SecurityRefreshService,
    );
  });

  it('ETF 시세를 받아 KRW 종목만 원화 정수 가격으로 upsert한다', async () => {
    getEtfPrices.mockResolvedValueOnce({
      totalCount: 2,
      items: [
        { ...item('KR7441640000', '20261105'), clpr: '10120', mkp: '10100', hipr: '10150', lopr: '10080' },
        item('KR7999999999', '20261105'), // security에 없는 종목
      ],
    });

    const result = await service.importEtfFromDataGoKr({
      from: '2026-11-05',
      to: '2026-11-05',
    });

    expect(getEtfPrices).toHaveBeenCalledWith({
      beginBasDt: '20261105',
      endBasDt: '20261106',
      pageNo: 1,
      numOfRows: 10_000,
    });
    expect(upsert).toHaveBeenCalledWith(
      [
        {
          id: 'KR7441640000',
          date: '2026-11-05',
          openingPrice: '10100',
          closingPrice: '10120',
          highestPrice: '10150',
          lowestPrice: '10080',
        },
      ],
      ['id', 'date'],
    );
    expect(result).toMatchObject({ fetched: 2, saved: 1, skipped: 1 });
  });
});
