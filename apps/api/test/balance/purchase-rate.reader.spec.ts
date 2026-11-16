import { NotFoundException } from '@nestjs/common';
import type { DailyExchangeRate, PurchaseDateBalance } from '@app/common';
import { PurchaseRateReader } from '../../src/balance/purchase-rate.reader.js';
import type { ExchangeRateReader } from '../../src/security/exchange-rate.reader.js';

const purchase = (exchangeRate: string | null) =>
  ({ purchaseDate: '2026-01-02', exchangeRate }) as PurchaseDateBalance;

describe('PurchaseRateReader.getRate', () => {
  const findUsdOnOrBefore = vi.fn();
  let reader: PurchaseRateReader;

  beforeEach(() => {
    vi.resetAllMocks();
    reader = new PurchaseRateReader({
      findUsdOnOrBefore,
    } as unknown as ExchangeRateReader);
  });

  it('저장된 구매 환율이 있으면 그 값을 쓰고 환율을 조회하지 않는다', async () => {
    await expect(reader.getRate(purchase('1380.500000'), new Map())).resolves.toBe(
      '1380.500000',
    );
    expect(findUsdOnOrBefore).not.toHaveBeenCalled();
  });

  it('저장된 환율이 없으면 매수일(이전 최근) USD 환율을 캐시와 함께 조회한다', async () => {
    findUsdOnOrBefore.mockResolvedValue({ closingRate: '1400.000000' });
    const cache = new Map<string, DailyExchangeRate | null>();

    await expect(reader.getRate(purchase(null), cache)).resolves.toBe('1400.000000');
    expect(findUsdOnOrBefore).toHaveBeenCalledWith('2026-01-02', cache);
  });

  it('저장된 환율도 매수일 이전 환율도 없으면 404', async () => {
    findUsdOnOrBefore.mockResolvedValue(null);

    await expect(reader.getRate(purchase(null), new Map())).rejects.toThrow(
      NotFoundException,
    );
  });
});
