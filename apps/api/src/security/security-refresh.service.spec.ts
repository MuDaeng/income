import { Logger } from '@nestjs/common';
import { Currency, type Security, type SecuritySearch } from '@app/common';
import type { Repository } from 'typeorm';
import type { DailyPriceFetcher } from './daily-price.fetcher.js';
import type { DividendService } from './dividend.service.js';
import { SecurityRefreshService } from './security-refresh.service.js';

const SAMSUNG = {
  id: 'KR7005930003',
  symbol: '005930',
  currency: Currency.KRW,
} as Security;

describe('SecurityRefreshService.refresh', () => {
  const findOneBy = vi.fn();
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
    fetchDividends.mockResolvedValue({ fetched: 2, saved: 2 });
    fetchPrices.mockResolvedValue(480);
    service = new SecurityRefreshService(
      {
        findOneBy,
        upsert: searchUpsert,
      } as unknown as Repository<SecuritySearch>,
      { fetchAndSave: fetchDividends } as unknown as DividendService,
      { fetchAndSave: fetchPrices } as unknown as DailyPriceFetcher,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('오늘(한국 시간) 이미 조회했으면 원천을 호출하지 않는다', async () => {
    findOneBy.mockResolvedValue({
      id: SAMSUNG.id,
      lastSearchDate: '2026-11-09',
    });

    await service.refresh(SAMSUNG);

    expect(findOneBy).toHaveBeenCalledWith({ id: SAMSUNG.id });
    expect(fetchDividends).not.toHaveBeenCalled();
    expect(fetchPrices).not.toHaveBeenCalled();
    expect(searchUpsert).not.toHaveBeenCalled();
  });

  it.each([
    ['조회 기록이 없으면', null],
    ['마지막 조회가 어제면', { id: SAMSUNG.id, lastSearchDate: '2026-11-08' }],
  ])(
    '%s 배당(2년 전~1년 뒤)과 시세(2년 전~오늘)를 받고 lastSearchDate를 오늘로 둔다',
    async (_, search) => {
      findOneBy.mockResolvedValue(search);

      await service.refresh(SAMSUNG);

      expect(fetchDividends).toHaveBeenCalledWith(
        SAMSUNG,
        '2024-11-09',
        '2027-11-09',
      );
      expect(fetchPrices).toHaveBeenCalledWith(
        SAMSUNG,
        '2024-11-09',
        '2026-11-09',
      );
      expect(searchUpsert).toHaveBeenCalledWith(
        { id: SAMSUNG.id, lastSearchDate: '2026-11-09' },
        ['id'],
      );
    },
  );

  it('배당 조회가 실패해도 시세는 받고, 예외 없이 로그만 남기며 날짜는 그대로 둔다', async () => {
    findOneBy.mockResolvedValue(null);
    fetchDividends.mockRejectedValue(new Error('KIS 배당 조회 실패: 500'));

    await expect(service.refresh(SAMSUNG)).resolves.toBeUndefined();

    expect(fetchPrices).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('KIS 배당 조회 실패: 500'),
    );
    expect(searchUpsert).not.toHaveBeenCalled();
  });

  it('시세 조회가 실패해도 예외 없이 로그만 남기며 날짜는 그대로 둔다', async () => {
    findOneBy.mockResolvedValue(null);
    fetchPrices.mockRejectedValue(new Error('Massive 시세 조회 실패: 429'));

    await expect(service.refresh(SAMSUNG)).resolves.toBeUndefined();

    expect(fetchDividends).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('시세 갱신'));
    expect(searchUpsert).not.toHaveBeenCalled();
  });

  it('USD 종목은 시세를 batch가 받으므로 배당만 받고 lastSearchDate를 오늘로 둔다', async () => {
    findOneBy.mockResolvedValue(null);
    const apple = {
      id: 'US0378331005',
      symbol: 'AAPL',
      currency: Currency.USD,
    } as Security;

    await service.refresh(apple);

    expect(fetchDividends).toHaveBeenCalledWith(apple, '2024-11-09', '2027-11-09');
    expect(fetchPrices).not.toHaveBeenCalled();
    expect(searchUpsert).toHaveBeenCalledWith(
      { id: apple.id, lastSearchDate: '2026-11-09' },
      ['id'],
    );
  });

  it('KRW·USD 외 통화는 아무것도 하지 않는다', async () => {
    await service.refresh({ id: 'JP3633400001', symbol: '7203', currency: 'JPY' } as unknown as Security);

    expect(findOneBy).not.toHaveBeenCalled();
    expect(fetchDividends).not.toHaveBeenCalled();
  });
});
