import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  addYears,
  formatIsoDate,
  fromYmd,
  isWeekend,
  krwPriceDate,
  nextMonthFirst,
  todayIn,
  todayInSeoul,
  toYmd,
} from '../../src/base/iso-date.js';

describe('iso-date', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('UTC 날짜로 더하고 뺀다 (월·연 경계, 윤년)', () => {
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addYears('2026-11-28', -2)).toBe('2024-11-28');
    expect(formatIsoDate(new Date('2026-11-28T23:59:59Z'))).toBe('2026-11-28');
  });

  it('다음 달 1일, 주말 여부', () => {
    expect(nextMonthFirst('2026-12-15')).toBe('2027-01-01');
    expect(isWeekend('2026-11-28')).toBe(true);
    expect(isWeekend('2026-11-30')).toBe(false);
  });

  it('YYYYMMDD ↔ YYYY-MM-DD', () => {
    expect(toYmd('2026-11-28')).toBe('20261128');
    expect(fromYmd('20261128')).toBe('2026-11-28');
  });

  it('시간대별 오늘, 국내 시세 날짜(15:30 기준)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 한국 2026-11-29 00:30 = 미국 동부 2026-11-28 10:30
    vi.setSystemTime(new Date('2026-11-28T15:30:00Z'));
    expect(todayInSeoul()).toBe('2026-11-29');
    expect(todayIn('America/New_York')).toBe('2026-11-28');

    expect(krwPriceDate(new Date('2026-11-27T06:29:00Z'))).toBe('2026-11-26');
    expect(krwPriceDate(new Date('2026-11-27T06:30:00Z'))).toBe('2026-11-27');
  });
});
