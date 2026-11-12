import { Like } from 'typeorm';
import type { Repository } from 'typeorm';
import { Currency, DailySecurity, Security } from '@app/common';
import type { TossClient } from '../clients/toss/toss.client.js';
import { searchSecuritiesSchema } from './search-securities.schema.js';
import { SEARCH_LIMIT, SecurityService } from './security.service.js';

const security = (id: string, symbol: string, name: string, currency = Currency.KRW) => ({
  id,
  symbol,
  name,
  currency,
});

describe('SecurityService.searchSecurities', () => {
  const find = vi.fn();
  const findOne = vi.fn();
  let service: SecurityService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new SecurityService(
      { find } as unknown as Repository<Security>,
      { findOne } as unknown as Repository<DailySecurity>,
      {} as TossClient,
    );
  });

  it('symbol 일치 → 종목명 일치 → 종목명 부분일치 순으로 중복 없이 붙이고 최근 종가를 통화별로 버린다', async () => {
    const usSk = security('US21874J7019', 'SK', 'SK', Currency.USD);
    const krSk = security('KR7034730002', '034730', 'SK');
    const skHynix = security('KR7000660001', '000660', 'SK하이닉스');
    const etf = security('KR70198D0001', '0198D0', '1Q SK하이닉스레버리지');
    find
      .mockResolvedValueOnce([usSk]) // symbol
      .mockResolvedValueOnce([krSk, usSk]) // 종목명 완전일치
      .mockResolvedValueOnce([etf, krSk, usSk, skHynix]); // 종목명 부분일치 (종목명 순)
    findOne.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(
        where.id === skHynix.id
          ? null
          : {
              id: where.id,
              date: '2026-11-05',
              closingPrice: where.id === usSk.id ? '12.120000' : '482500.000000',
            },
      ),
    );

    const result = await service.searchSecurities({ keyword: 'SK' });

    expect(find).toHaveBeenNthCalledWith(1, {
      where: { symbol: 'SK' },
      order: { id: 'ASC' },
      take: SEARCH_LIMIT,
    });
    expect(find).toHaveBeenNthCalledWith(2, {
      where: { name: 'SK' },
      order: { id: 'ASC' },
      take: SEARCH_LIMIT,
    });
    expect(find).toHaveBeenNthCalledWith(3, {
      where: { name: Like('%SK%') },
      order: { name: 'ASC', id: 'ASC' },
      take: SEARCH_LIMIT,
    });
    expect(findOne).toHaveBeenCalledWith({
      where: { id: usSk.id },
      order: { date: 'DESC' },
    });
    expect(result).toEqual([
      { ...usSk, closingPrice: '12.120000', priceDate: '2026-11-05' },
      { ...krSk, closingPrice: '482500', priceDate: '2026-11-05' },
      { ...etf, closingPrice: '482500', priceDate: '2026-11-05' },
      { ...skHynix, closingPrice: null, priceDate: null },
    ]);
  });

  it('LIKE 특수문자는 글자 그대로 찾고, 합친 결과는 최대 SEARCH_LIMIT건', async () => {
    const many = Array.from({ length: SEARCH_LIMIT }, (_, i) =>
      security(`KR${String(i).padStart(10, '0')}`, String(i), `종목${i}`),
    );
    find
      .mockResolvedValueOnce([security('X', '100%_\\', '심볼')])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(many);
    findOne.mockResolvedValue(null);

    const result = await service.searchSecurities({ keyword: '100%_\\' });

    expect(find.mock.calls[2][0].where).toEqual({ name: Like('%100\\%\\_\\\\%') });
    expect(result).toHaveLength(SEARCH_LIMIT);
    expect(result[0].id).toBe('X');
  });

  it('결과가 없으면 빈 배열', async () => {
    find.mockResolvedValue([]);

    await expect(service.searchSecurities({ keyword: '없는종목' })).resolves.toEqual([]);
    expect(findOne).not.toHaveBeenCalled();
  });
});

describe('searchSecuritiesSchema', () => {
  it('keyword 앞뒤 공백을 지우고, 없거나 공백뿐이면 거절한다', () => {
    expect(searchSecuritiesSchema.parse({ keyword: ' 애플 ' })).toEqual({ keyword: '애플' });
    expect(searchSecuritiesSchema.safeParse({}).success).toBe(false);
    expect(searchSecuritiesSchema.safeParse({ keyword: '  ' }).success).toBe(false);
  });
});
