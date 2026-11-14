import { registerBalanceSchema } from '../../src/balance/register-balance.schema.js';

const base = {
  securityId: '005930',
  purchaseDate: '2026-11-05',
  amount: '10',
  price: '70000',
};

describe('registerBalanceSchema saleDate', () => {
  it('생략하거나 null이면 통과한다', () => {
    expect(registerBalanceSchema.safeParse(base).success).toBe(true);
    expect(
      registerBalanceSchema.safeParse({ ...base, saleDate: null }).success,
    ).toBe(true);
  });

  it('매수일과 같거나 이후면 통과한다', () => {
    expect(
      registerBalanceSchema.safeParse({ ...base, saleDate: '2026-11-05' })
        .success,
    ).toBe(true);
    expect(
      registerBalanceSchema.safeParse({ ...base, saleDate: '2026-11-06' })
        .success,
    ).toBe(true);
  });

  it('매수일보다 이전이면 saleDate 오류', () => {
    const result = registerBalanceSchema.safeParse({
      ...base,
      saleDate: '2026-11-04',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ['saleDate'],
    ]);
  });

  it('형식이 틀리면 saleDate 형식 오류만 낸다', () => {
    const result = registerBalanceSchema.safeParse({
      ...base,
      saleDate: '2026/11/06',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toHaveLength(1);
    expect(result.error?.issues[0].path).toEqual(['saleDate']);
  });
});

describe('registerBalanceSchema exchangeRate', () => {
  it('생략·null·양수 문자열이면 통과한다', () => {
    expect(registerBalanceSchema.safeParse(base).success).toBe(true);
    expect(
      registerBalanceSchema.safeParse({ ...base, exchangeRate: null }).success,
    ).toBe(true);
    expect(
      registerBalanceSchema.safeParse({ ...base, exchangeRate: '1400.25' })
        .success,
    ).toBe(true);
  });

  it.each(['0', 'abc', '-1400', '1,400'])('%s이면 exchangeRate 오류', (value) => {
    const result = registerBalanceSchema.safeParse({
      ...base,
      exchangeRate: value,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ['exchangeRate'],
    ]);
  });
});
