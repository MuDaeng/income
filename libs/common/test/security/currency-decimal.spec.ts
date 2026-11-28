import { Decimal } from 'decimal.js';
import { Currency } from '../../src/security/currency.enum.js';
import {
  parseKrwPrice,
  toKrw,
  toUsd,
  truncateByCurrency,
  truncateRate,
} from '../../src/security/currency-decimal.js';

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

describe('truncateRate', () => {
  it('통화와 무관하게 소수 6자리로 버림', () => {
    expect(truncateRate('1400.1234567')).toBe('1400.123456');
    expect(truncateRate(1385.5)).toBe('1385.500000');
  });
});

describe('parseKrwPrice', () => {
  it('원화 정수로 버리고, 빈 값은 0', () => {
    expect(parseKrwPrice(' 71200.9 ')).toBe('71200');
    expect(parseKrwPrice('')).toBe('0');
    expect(parseKrwPrice(undefined)).toBe('0');
  });
});

describe('toKrw / toUsd', () => {
  it('통화별 자릿수로 버림 (truncateByCurrency와 같음)', () => {
    expect(toKrw('1234.9')).toBe('1234');
    expect(toUsd('0.1234567')).toBe('0.123456');
  });

  it('toKrw는 빈 문자열이면 예외 (원천 문자열은 parseKrwPrice)', () => {
    expect(() => toKrw('')).toThrow();
  });
});
