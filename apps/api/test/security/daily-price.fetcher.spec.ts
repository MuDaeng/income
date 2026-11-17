import {
  Currency,
  type DailySecurity,
  type KisClient,
  type KisDailyPriceItem,
  type Security,
  SecurityType,
} from '@app/common';
import type { Repository } from 'typeorm';
import { DailyPriceFetcher } from '../../src/security/daily-price.fetcher.js';

const SAMSUNG = {
  id: 'KR7005930003',
  symbol: '005930',
  type: SecurityType.STOCK,
  currency: Currency.KRW,
} as Security;
const APPLE = {
  id: 'US0378331005',
  symbol: 'AAPL',
  type: SecurityType.FOREIGN_STOCK,
  currency: Currency.USD,
} as Security;

const bar = (stck_bsop_date: string): KisDailyPriceItem => ({
  stck_bsop_date,
  stck_oprc: '71000',
  stck_hgpr: '72500',
  stck_lwpr: '',
  stck_clpr: '72000.5',
});

describe('DailyPriceFetcher.fetchAndSave', () => {
  const upsert = vi.fn();
  const getDailyPrices = vi.fn<KisClient['getDailyPrices']>();
  let fetcher: DailyPriceFetcher;

  beforeEach(() => {
    vi.resetAllMocks();
    fetcher = new DailyPriceFetcher(
      { upsert } as unknown as Repository<DailySecurity>,
      { getDailyPrices } as unknown as KisClient,
    );
  });

  it('KIS에서 그날 하루 시세를 단축코드로 받아 원화 정수로 upsert한다', async () => {
    getDailyPrices.mockResolvedValue([bar('20261116')]);

    await expect(fetcher.fetchAndSave(SAMSUNG, '2026-11-16')).resolves.toBe(1);

    expect(getDailyPrices).toHaveBeenCalledWith('005930', '20261116', '20261116');
    expect(upsert).toHaveBeenCalledWith(
      [
        {
          id: SAMSUNG.id,
          date: '2026-11-16',
          openingPrice: '71000',
          closingPrice: '72000',
          highestPrice: '72500',
          lowestPrice: '0',
        },
      ],
      ['id', 'date'],
    );
  });

  it('시세가 없는 날(휴장일)이면 저장하지 않고 0', async () => {
    getDailyPrices.mockResolvedValue([]);

    await expect(fetcher.fetchAndSave(SAMSUNG, '2026-11-15')).resolves.toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('요청한 날짜가 아닌 행은 버린다', async () => {
    getDailyPrices.mockResolvedValue([bar('20261113')]);

    await expect(fetcher.fetchAndSave(SAMSUNG, '2026-11-16')).resolves.toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('KRW 외 통화는 호출하지 않고 0', async () => {
    await expect(fetcher.fetchAndSave(APPLE, '2026-11-16')).resolves.toBe(0);
    expect(getDailyPrices).not.toHaveBeenCalled();
  });
});
