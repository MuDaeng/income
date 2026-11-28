import { describe, expect, it } from 'vitest';
import { DATE_RANGE_ERROR, isOrderedDateRange } from '../../src/base/date-range.js';

describe('isOrderedDateRange', () => {
  it('둘 다 있으면 from <= to일 때만 true', () => {
    expect(isOrderedDateRange({ from: '2026-01-01', to: '2026-01-01' })).toBe(true);
    expect(isOrderedDateRange({ from: '2026-01-01', to: '2026-12-31' })).toBe(true);
    expect(isOrderedDateRange({ from: '2026-02-01', to: '2026-01-31' })).toBe(false);
  });

  it('한쪽이라도 없으면 true (생략 = 범위 제한 없음)', () => {
    expect(isOrderedDateRange({})).toBe(true);
    expect(isOrderedDateRange({ from: '2026-02-01' })).toBe(true);
    expect(isOrderedDateRange({ to: '2026-01-31' })).toBe(true);
  });

  it('형식이 틀리면 순서 검사를 건너뛴다 (형식 오류는 필드 검증이 낸다)', () => {
    expect(isOrderedDateRange({ from: '20260201', to: '2026-01-31' })).toBe(true);
  });

  it('오류는 from 필드에 붙는다', () => {
    expect(DATE_RANGE_ERROR.path).toEqual(['from']);
  });
});
