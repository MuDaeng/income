import { krwTradingDayBefore } from '../../src/security/trading-day.js';

// 2024-12-31(화) 휴장, 12-25(수) 휴장
const tradingDays = [
  '2024-12-16',
  '2024-12-17',
  '2024-12-18',
  '2024-12-19',
  '2024-12-20',
  '2024-12-23',
  '2024-12-24',
  '2024-12-26',
  '2024-12-27',
  '2024-12-30',
  '2025-01-02',
];

describe('krwTradingDayBefore', () => {
  it('마지막 거래일에서 count거래일 앞 (휴장일 건너뜀)', () => {
    expect(krwTradingDayBefore('2024-12-31', 1, tradingDays)).toBe('2024-12-27');
    expect(krwTradingDayBefore('2024-12-31', 2, tradingDays)).toBe('2024-12-26');
    expect(krwTradingDayBefore('2024-12-27', 2, tradingDays)).toBe('2024-12-24');
  });

  it('count 0이면 날짜 이전(포함) 마지막 거래일', () => {
    expect(krwTradingDayBefore('2024-12-31', 0, tradingDays)).toBe('2024-12-30');
  });

  it('목록이 날짜를 덮지 못하면 평일로 계산한다', () => {
    // 미래 날짜 (목록 끝 이후)
    expect(krwTradingDayBefore('2025-01-06', 2, tradingDays)).toBe('2025-01-02');
    // 목록 시작이 7일 이상 앞이 아님
    expect(krwTradingDayBefore('2024-12-18', 2, tradingDays)).toBe('2024-12-16');
    expect(krwTradingDayBefore('2024-12-18', 2, [])).toBe('2024-12-16');
  });

  it('평일 계산은 주말 날짜를 직전 금요일로 보고 거슬러 간다', () => {
    // 2024-12-29(일) → 금 12-27 → 2평일 전 12-25
    expect(krwTradingDayBefore('2024-12-29', 2, [])).toBe('2024-12-25');
  });
});
