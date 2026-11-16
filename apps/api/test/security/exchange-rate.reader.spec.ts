import { LessThanOrEqual } from 'typeorm';
import type { Repository } from 'typeorm';
import { Currency, type DailyExchangeRate } from '@app/common';
import { ExchangeRateReader } from '../../src/security/exchange-rate.reader.js';

const rate = (date: string, closingRate: string) =>
  ({ date, currency: Currency.USD, closingRate }) as DailyExchangeRate;

describe('ExchangeRateReader', () => {
  const findOne = vi.fn();
  const find = vi.fn();
  let reader: ExchangeRateReader;

  beforeEach(() => {
    vi.resetAllMocks();
    reader = new ExchangeRateReader({
      findOne,
      find,
    } as unknown as Repository<DailyExchangeRate>);
  });

  it('findLatestUsd: 가장 최근 USD 환율을 조회한다', async () => {
    findOne.mockResolvedValue(rate('2026-11-13', '1400.000000'));

    await expect(reader.findLatestUsd()).resolves.toEqual(
      rate('2026-11-13', '1400.000000'),
    );
    expect(findOne).toHaveBeenCalledWith({
      where: { currency: Currency.USD },
      order: { date: 'DESC' },
    });
  });

  it('findUsdOnOrBefore: 그날(포함) 이전 가장 최근 환율을 조회한다', async () => {
    findOne.mockResolvedValue(rate('2026-11-13', '1400.000000'));

    await expect(reader.findUsdOnOrBefore('2026-11-15')).resolves.toEqual(
      rate('2026-11-13', '1400.000000'),
    );
    expect(findOne).toHaveBeenCalledWith({
      where: { currency: Currency.USD, date: LessThanOrEqual('2026-11-15') },
      order: { date: 'DESC' },
    });
  });

  it('findUsdOnOrBefore: cache를 주면 같은 날짜는 한 번만 조회하고, 없는 결과(null)도 캐시한다', async () => {
    findOne
      .mockResolvedValueOnce(rate('2026-11-13', '1400.000000'))
      .mockResolvedValueOnce(null);
    const cache = new Map<string, DailyExchangeRate | null>();

    await reader.findUsdOnOrBefore('2026-11-15', cache);
    await expect(reader.findUsdOnOrBefore('2026-11-15', cache)).resolves.toEqual(
      rate('2026-11-13', '1400.000000'),
    );
    await reader.findUsdOnOrBefore('2020-01-01', cache);
    await expect(reader.findUsdOnOrBefore('2020-01-01', cache)).resolves.toBeNull();

    expect(findOne).toHaveBeenCalledTimes(2);
  });

  it('findUsdUpTo: 그날(포함)까지 USD 환율을 날짜 오름차순으로 조회한다', async () => {
    find.mockResolvedValue([]);

    await reader.findUsdUpTo('2026-10-31');

    expect(find).toHaveBeenCalledWith({
      where: { currency: Currency.USD, date: LessThanOrEqual('2026-10-31') },
      order: { date: 'ASC' },
    });
  });
});
