import { Decimal } from 'decimal.js';
import { Currency } from './currency.enum.js';
import { truncateByCurrency } from './currency-decimal.js';

describe('truncateByCurrency', () => {
  it('KRW는 정수로 버림', () => {
    expect(truncateByCurrency('1234.6', Currency.KRW)).toBe('1234');
    expect(truncateByCurrency('10.999999', Currency.KRW)).toBe('10');
    expect(truncateByCurrency(71200, Currency.KRW)).toBe('71200');
  });

  it('USD는 소수 6자리로 버림', () => {
    expect(truncateByCurrency('0.1234567', Currency.USD)).toBe('0.123456');
    expect(truncateByCurrency('123.45', Currency.USD)).toBe('123.450000');
  });

  it('decimal.js 계산 결과를 그대로 받음 (부동소수점 오차 없음)', () => {
    const sum = new Decimal('0.1').plus('0.2');
    expect(truncateByCurrency(sum, Currency.USD)).toBe('0.300000');
  });

  it('음수도 0 쪽으로 버림', () => {
    expect(truncateByCurrency('-1234.6', Currency.KRW)).toBe('-1234');
  });
});
