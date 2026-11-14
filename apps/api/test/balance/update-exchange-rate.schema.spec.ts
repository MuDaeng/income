import { updateExchangeRateSchema } from '../../src/balance/update-exchange-rate.schema.js';

const base = {
  securityId: ' US0378331005 ',
  purchaseDate: '2026-11-05',
  sequence: 1,
};

describe('updateExchangeRateSchema', () => {
  it('양수 문자열이나 null이면 통과하고 securityId 공백을 지운다', () => {
    expect(
      updateExchangeRateSchema.parse({ ...base, exchangeRate: '1400.5' }),
    ).toEqual({ ...base, securityId: 'US0378331005', exchangeRate: '1400.5' });
    expect(
      updateExchangeRateSchema.safeParse({ ...base, exchangeRate: null }).success,
    ).toBe(true);
  });

  it('exchangeRate를 생략하면 거절한다 (지우려면 null을 명시)', () => {
    const result = updateExchangeRateSchema.safeParse(base);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['exchangeRate']);
  });

  it.each(['0', 'abc', '-1'])('exchangeRate가 %s이면 거절한다', (value) => {
    const result = updateExchangeRateSchema.safeParse({
      ...base,
      exchangeRate: value,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ['exchangeRate'],
    ]);
  });

  it('sequence가 양의 정수가 아니면 거절한다', () => {
    expect(
      updateExchangeRateSchema.safeParse({ ...base, sequence: 0, exchangeRate: null })
        .success,
    ).toBe(false);
    expect(
      updateExchangeRateSchema.safeParse({ ...base, sequence: '1', exchangeRate: null })
        .success,
    ).toBe(false);
  });
});
