import { importExchangeRatesSchema } from '../../src/security/import-exchange-rates.schema.js';

describe('importExchangeRatesSchema', () => {
  it('생략하거나 시작일 <= 종료일이면 통과한다', () => {
    expect(importExchangeRatesSchema.safeParse({}).success).toBe(true);
    expect(importExchangeRatesSchema.safeParse({ from: '2025-01-01' }).success).toBe(true);
    expect(
      importExchangeRatesSchema.safeParse({ from: '2025-01-01', to: '2025-01-01' }).success,
    ).toBe(true);
  });

  it('날짜 형식이 아니면 거절한다', () => {
    expect(importExchangeRatesSchema.safeParse({ to: '2025/01/01' }).success).toBe(false);
  });

  it('시작일이 종료일보다 뒤면 from에 오류를 낸다', () => {
    const result = importExchangeRatesSchema.safeParse({
      from: '2025-02-01',
      to: '2025-01-01',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['from']);
  });
});
