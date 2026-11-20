import { tossTradeDate } from '../../src/balance/toss-trade-date.js';

describe('tossTradeDate', () => {
  it.each([
    ['2026-10-22', '2026-10-20'], // 목 → 화
    ['2026-10-19', '2026-10-15'], // 월 → 지난주 목
    ['2026-10-20', '2026-10-16'], // 화 → 지난주 금
    ['2026-10-18', '2026-10-14'], // 일 → 금 기준 2평일 전
    ['2026-01-02', '2025-12-31'], // 연 경계
  ])('거래일 목록이 없으면 평일 2일 앞당긴다 (%s → %s)', (settlement, expected) => {
    expect(tossTradeDate(settlement, [])).toBe(expected);
  });

  it('거래일 목록이 결제일을 덮으면 휴장일을 건너뛴다', () => {
    // 10-16(금) 휴장
    const tradingDays = [
      '2026-10-08',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-19',
      '2026-10-20',
    ];
    expect(tossTradeDate('2026-10-20', tradingDays)).toBe('2026-10-15');
  });
});
