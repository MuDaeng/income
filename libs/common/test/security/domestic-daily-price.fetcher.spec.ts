import { Logger } from '@nestjs/common';
import { Currency, type DailySecurity, type Security } from '@app/common';
import type { Repository } from 'typeorm';
import type { DataGoKrClient } from '../../src/client/data-go-kr/data-go-kr.client.js';
import type {
  PriceItem,
  PricePage,
  PriceQuery,
} from '../../src/client/data-go-kr/data-go-kr.types.js';
import {
  DomesticDailyPriceFetcher,
  monthlyWindows,
} from '../../src/security/domestic-daily-price.fetcher.js';

const SAMSUNG = 'KR7005930003';
const KODEX = 'KR7069500007';

const item = (isinCd: string, basDt: string, clpr = '70500.9'): PriceItem => ({
  basDt,
  srtnCd: isinCd.slice(3, 9),
  isinCd,
  itmsNm: '',
  clpr,
  mkp: '70000',
  hipr: '71000',
  lopr: '',
});
const page = (items: PriceItem[], totalCount = items.length): PricePage => ({
  totalCount,
  items,
});

describe('DomesticDailyPriceFetcher.importFromDataGoKr', () => {
  const upsert = vi.fn();
  const find = vi.fn();
  const getStockPrices = vi.fn<(query: PriceQuery) => Promise<PricePage>>();
  const getEtfPrices = vi.fn<(query: PriceQuery) => Promise<PricePage>>();
  let fetcher: DomesticDailyPriceFetcher;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    find.mockResolvedValue([{ id: SAMSUNG }, { id: KODEX }]);
    getStockPrices.mockResolvedValue(page([]));
    getEtfPrices.mockResolvedValue(page([]));
    fetcher = new DomesticDailyPriceFetcher(
      { upsert } as unknown as Repository<DailySecurity>,
      { find } as unknown as Repository<Security>,
      { getStockPrices, getEtfPrices } as unknown as DataGoKrClient,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('주식·ETF 시세에서 security의 KRW 종목만 원화 정수로 upsert하고 합산한다', async () => {
    getStockPrices.mockResolvedValue(
      page([item(SAMSUNG, '20261113'), item('KR7999999999', '20261113')]),
    );
    getEtfPrices.mockResolvedValue(page([item(KODEX, '20261116', '35000')]));

    const result = await fetcher.importFromDataGoKr({
      from: '2026-11-13',
      to: '2026-11-17',
    });

    expect(find).toHaveBeenCalledWith({
      select: { id: true },
      where: { currency: Currency.KRW },
    });
    expect(getStockPrices).toHaveBeenCalledWith({
      beginBasDt: '20261113',
      endBasDt: '20261118',
      pageNo: 1,
      numOfRows: 10_000,
    });
    expect(getEtfPrices).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls).toEqual([
      [
        [
          {
            id: SAMSUNG,
            date: '2026-11-13',
            openingPrice: '70000',
            closingPrice: '70500',
            highestPrice: '71000',
            lowestPrice: '0',
          },
        ],
        ['id', 'date'],
      ],
      [[expect.objectContaining({ id: KODEX, date: '2026-11-16', closingPrice: '35000' })], ['id', 'date']],
    ]);
    expect(result).toEqual({
      from: '2026-11-13',
      to: '2026-11-17',
      fetched: 3,
      saved: 2,
      skipped: 1,
      firstDate: '2026-11-13',
      lastDate: '2026-11-16',
    });
  });

  it('totalCount가 남으면 다음 페이지를 이어서 받는다', async () => {
    const full = Array.from({ length: 10_000 }, () => item(SAMSUNG, '20261113'));
    getStockPrices
      .mockResolvedValueOnce(page(full, 10_001))
      .mockResolvedValueOnce(page([item(SAMSUNG, '20261116')], 10_001));

    const result = await fetcher.importFromDataGoKr({
      from: '2026-11-13',
      to: '2026-11-17',
    });

    expect(getStockPrices.mock.calls.map(([query]) => query.pageNo)).toEqual([1, 2]);
    expect(result.saved).toBe(10_001);
  });

  it('긴 기간은 달마다 나눠 받는다', async () => {
    await fetcher.importFromDataGoKr({ from: '2026-09-15', to: '2026-11-17' });

    expect(
      getStockPrices.mock.calls.map(([query]) => [query.beginBasDt, query.endBasDt]),
    ).toEqual([
      ['20260915', '20261001'],
      ['20261001', '20261101'],
      ['20261101', '20261118'],
    ]);
    expect(getEtfPrices).toHaveBeenCalledTimes(3);
  });
});

describe('monthlyWindows', () => {
  it('달력 달 경계로 나누고, 한 달 안이면 한 구간', () => {
    expect(monthlyWindows('2026-11-13', '2026-11-17')).toEqual([
      { from: '2026-11-13', to: '2026-11-17' },
    ]);
    expect(monthlyWindows('2024-01-31', '2024-03-01')).toEqual([
      { from: '2024-01-31', to: '2024-01-31' },
      { from: '2024-02-01', to: '2024-02-29' },
      { from: '2024-03-01', to: '2024-03-01' },
    ]);
  });
});
