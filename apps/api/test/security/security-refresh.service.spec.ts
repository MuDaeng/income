import { Logger } from '@nestjs/common';
import {
  Currency,
  SearchType,
  type Security,
  type SecuritySearch,
} from '@app/common';
import type { Repository } from 'typeorm';
import type { DailyPriceFetcher } from '../../src/security/daily-price.fetcher.js';
import type { DividendService } from '../../src/security/dividend.service.js';
import { SecurityRefreshService } from '../../src/security/security-refresh.service.js';

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
const search = (type: SearchType, lastSearchDate: string) => ({
  id: SAMSUNG.id,
  type,
  lastSearchDate,
});
const saved = (security: Security, type: SearchType) => [
  { id: security.id, type, lastSearchDate: TODAY },
  ['id', 'type'],
];

describe('SecurityRefreshService.refresh', () => {
  const findBy = vi.fn();
  const searchUpsert = vi.fn();
  const fetchDividends = vi.fn<DividendService['fetchAndSave']>();
  const fetchPrices = vi.fn<DailyPriceFetcher['fetchAndSave']>();
  let errorLog: ReturnType<typeof vi.spyOn>;
  let service: SecurityRefreshService;

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
    service = new SecurityRefreshService(
      { findBy, upsert: searchUpsert } as unknown as Repository<SecuritySearch>,
      { fetchAndSave: fetchDividends } as unknown as DividendService,
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

  it('조회 기록이 없으면 배당(2년 전~1년 뒤)과 시세(2년 전~오늘)를 받고 종류마다 조회일을 남긴다', async () => {
    await service.refresh(SAMSUNG);

    expect(fetchDividends).toHaveBeenCalledWith(
      SAMSUNG,
      '2024-11-09',
      '2027-11-09',
    );
    expect(fetchPrices).toHaveBeenCalledWith(SAMSUNG, '2024-11-09', TODAY);
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
    expect(searchUpsert.mock.calls).toEqual([saved(APPLE, SearchType.INCOME)]);
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
