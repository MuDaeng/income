import { describe, expect, it } from 'vitest';
import { Currency } from '@app/common';
import { priceLookupDate } from '../../src/security/price-date.js';

describe('priceLookupDate', () => {
  // 2026-11-27 15:29 / 15:30 KST
  const beforeClose = new Date('2026-11-27T06:29:00Z');
  const afterClose = new Date('2026-11-27T06:30:00Z');

  it('USD는 하루 전 날짜(미국 거래일)', () => {
    expect(priceLookupDate(Currency.USD, '2026-11-27', beforeClose)).toBe('2026-11-26');
  });

  it('KRW는 장 마감 전이면 전날, 마감 후면 그날을 넘지 않는다', () => {
    expect(priceLookupDate(Currency.KRW, '2026-11-27', beforeClose)).toBe('2026-11-26');
    expect(priceLookupDate(Currency.KRW, '2026-11-27', afterClose)).toBe('2026-11-27');
    expect(priceLookupDate(Currency.KRW, '2026-10-31', beforeClose)).toBe('2026-10-31');
  });
});
