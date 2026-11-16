import { Logger } from '@nestjs/common';
import {
  Currency,
  SearchType,
  type Security,
  type SecuritySearch,
} from '@app/common';
import type { Repository } from 'typeorm';
import type { DailyPriceFetcher } from '../../src/security/daily-price.fetcher.js';
import type { DividendFetcher } from '../../src/security/dividend.fetcher.js';
import { SecurityRefresher } from '../../src/security/security.refresher.js';

const SAMSUNG = {
  id: 'KR7005930003',
  symbol: '005930',
  currency: Currency.KRW,
} as Security;
const APPLE = {
  id: 'US0378331005',
  symbol: 'AAPL',
  currency: Currency.USD,
} as Security;

/** 한국 시간 오늘 */
const TODAY = '2026-11-09';
/** KRW 시작일: 배당 2000-01-01, 시세 2020-01-01 */
const krwStart = (type: SearchType) =>
  type === SearchType.INCOME ? '2000-01-01' : '2020-01-01';
const search = (
  type: SearchType,
  lastSearchDate: string,
  fromDate: string | null = krwStart(type),
) => ({ id: SAMSUNG.id, type, lastSearchDate, fromDate });
const saved = (
  security: Security,
  type: SearchType,
  fromDate = krwStart(type),
) => [
  { id: security.id, type, lastSearchDate: TODAY, fromDate },
  ['id', 'type'],
];

describe('SecurityRefresher.refresh', () => {
  const findBy = vi.fn();
  const searchUpsert = vi.fn();
  const fetchDividends = vi.fn<DividendFetcher['fetchAndSave']>();
  const fetchPrices = vi.fn<DailyPriceFetcher['fetchAndSave']>();
  let errorLog: ReturnType<typeof vi.spyOn>;
  let service: SecurityRefresher;

  beforeEach(() => {
    vi.resetAllMocks();
    // 2026-11-09 00:30 KST (UTC로는 11-08)
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-08T15:30:00Z'));
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    findBy.mockResolvedValue([]);
    fetchDividends.mockResolvedValue({ fetched: 2, saved: 2 });
    fetchPrices.mockResolvedValue(480);
    service = new SecurityRefresher(
      { findBy, upsert: searchUpsert } as unknown as Repository<SecuritySearch>,
      { fetchAndSave: fetchDividends } as unknown as DividendFetcher,
      { fetchAndSave: fetchPrices } as unknown as DailyPriceFetcher,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('배당·시세 모두 오늘(한국 시간) 조회했으면 원천을 호출하지 않는다', async () => {
    findBy.mockResolvedValue([
      search(SearchType.INCOME, TODAY),
      search(SearchType.PRICE, TODAY),
    ]);

    await service.refresh(SAMSUNG);

    expect(findBy).toHaveBeenCalledWith({ id: SAMSUNG.id });
    expect(fetchDividends).not.toHaveBeenCalled();
    expect(fetchPrices).not.toHaveBeenCalled();
    expect(searchUpsert).not.toHaveBeenCalled();
  });

  it('조회 기록이 없으면 KRW는 배당(2000-01-01~1년 뒤)과 시세(2020-01-01~오늘)를 받고 종류마다 조회일·시작일을 남긴다', async () => {
    await service.refresh(SAMSUNG);

    expect(fetchDividends).toHaveBeenCalledWith(
      SAMSUNG,
      '2000-01-01',
      '2027-11-09',
    );
    expect(fetchPrices).toHaveBeenCalledWith(SAMSUNG, '2020-01-01', TODAY);
    expect(searchUpsert.mock.calls).toEqual([
      saved(SAMSUNG, SearchType.INCOME),
      saved(SAMSUNG, SearchType.PRICE),
    ]);
  });

  it('배당만 오늘 조회했으면 시세만 받는다', async () => {
    findBy.mockResolvedValue([
      search(SearchType.INCOME, TODAY),
      search(SearchType.PRICE, '2026-11-08'),
    ]);

    await service.refresh(SAMSUNG);

    expect(fetchDividends).not.toHaveBeenCalled();
    expect(fetchPrices).toHaveBeenCalledTimes(1);
    expect(searchUpsert.mock.calls).toEqual([saved(SAMSUNG, SearchType.PRICE)]);
  });

  it('시세만 오늘 조회했으면 배당만 받는다', async () => {
    findBy.mockResolvedValue([search(SearchType.PRICE, TODAY)]);

    await service.refresh(SAMSUNG);

    expect(fetchDividends).toHaveBeenCalledTimes(1);
    expect(fetchPrices).not.toHaveBeenCalled();
    expect(searchUpsert.mock.calls).toEqual([
      saved(SAMSUNG, SearchType.INCOME),
    ]);
  });

  it('배당이 실패해도 시세는 받아 시세 조회일만 남기고, 예외 없이 로그를 남긴다', async () => {
    fetchDividends.mockRejectedValue(new Error('KIS 배당 조회 실패: 500'));

    await expect(service.refresh(SAMSUNG)).resolves.toBeUndefined();

    expect(fetchPrices).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('KIS 배당 조회 실패: 500'),
    );
    expect(searchUpsert.mock.calls).toEqual([saved(SAMSUNG, SearchType.PRICE)]);
  });

  it('시세가 실패하면 배당 조회일만 남긴다', async () => {
    fetchPrices.mockRejectedValue(new Error('data.go.kr 주식시세 조회 실패'));

    await expect(service.refresh(SAMSUNG)).resolves.toBeUndefined();

    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('price 갱신 실패'),
    );
    expect(searchUpsert.mock.calls).toEqual([
      saved(SAMSUNG, SearchType.INCOME),
    ]);
  });

  it('USD 종목은 시세를 batch가 받으므로 배당만 받고 배당 조회일만 남긴다', async () => {
    await service.refresh(APPLE);

    expect(fetchDividends).toHaveBeenCalledWith(
      APPLE,
      '2024-11-09',
      '2027-11-09',
    );
    expect(fetchPrices).not.toHaveBeenCalled();
    expect(searchUpsert.mock.calls).toEqual([
      saved(APPLE, SearchType.INCOME, '2024-11-09'),
    ]);
  });

  it('받아 둔 구간이 시작일을 덮으면 시세는 마지막 조회일−7일, 배당은 −1년부터만 받고 시작일은 유지한다', async () => {
    findBy.mockResolvedValue([
      search(SearchType.INCOME, '2026-11-01'),
      search(SearchType.PRICE, '2026-11-01'),
    ]);

    await service.refresh(SAMSUNG);

    expect(fetchDividends).toHaveBeenCalledWith(
      SAMSUNG,
      '2025-11-01',
      '2027-11-09',
    );
    expect(fetchPrices).toHaveBeenCalledWith(SAMSUNG, '2026-10-25', TODAY);
    expect(searchUpsert.mock.calls).toEqual([
      saved(SAMSUNG, SearchType.INCOME),
      saved(SAMSUNG, SearchType.PRICE),
    ]);
  });

  it('최근 구간이 시작일보다 앞이면 시작일부터 받는다', async () => {
    findBy.mockResolvedValue([search(SearchType.PRICE, '2020-01-03')]);

    await service.refresh(SAMSUNG);

    expect(fetchPrices).toHaveBeenCalledWith(SAMSUNG, '2020-01-01', TODAY);
  });

  it('시작일이 없거나(컬럼 추가 전 행) 시작일보다 늦으면 전체 구간을 다시 받는다', async () => {
    findBy.mockResolvedValue([
      search(SearchType.INCOME, '2026-11-08', null),
      search(SearchType.PRICE, '2026-11-08', '2024-11-08'),
    ]);

    await service.refresh(SAMSUNG);

    expect(fetchDividends).toHaveBeenCalledWith(
      SAMSUNG,
      '2000-01-01',
      '2027-11-09',
    );
    expect(fetchPrices).toHaveBeenCalledWith(SAMSUNG, '2020-01-01', TODAY);
    expect(searchUpsert.mock.calls).toEqual([
      saved(SAMSUNG, SearchType.INCOME),
      saved(SAMSUNG, SearchType.PRICE),
    ]);
  });

  it('2020년부터 받아 둔 국내 배당은 2000년부터 한 번 다시 받는다', async () => {
    findBy.mockResolvedValue([
      search(SearchType.INCOME, '2026-11-08', '2020-01-01'),
      search(SearchType.PRICE, TODAY),
    ]);

    await service.refresh(SAMSUNG);

    expect(fetchDividends).toHaveBeenCalledWith(
      SAMSUNG,
      '2000-01-01',
      '2027-11-09',
    );
    expect(searchUpsert.mock.calls).toEqual([saved(SAMSUNG, SearchType.INCOME)]);
  });

  it('USD 배당은 오늘−2년을 덮고 있으면 마지막 조회일−1년부터만 받는다', async () => {
    findBy.mockResolvedValue([
      { id: APPLE.id, type: SearchType.INCOME, lastSearchDate: '2026-11-08', fromDate: '2024-11-08' },
    ]);

    await service.refresh(APPLE);

    expect(fetchDividends).toHaveBeenCalledWith(
      APPLE,
      '2025-11-08',
      '2027-11-09',
    );
    expect(searchUpsert.mock.calls).toEqual([
      saved(APPLE, SearchType.INCOME, '2024-11-08'),
    ]);
  });

  it('KRW·USD 외 통화는 아무것도 하지 않는다', async () => {
    await service.refresh({
      id: 'JP3633400001',
      symbol: '7203',
      currency: 'JPY',
    } as unknown as Security);

    expect(findBy).not.toHaveBeenCalled();
    expect(fetchDividends).not.toHaveBeenCalled();
  });
});
