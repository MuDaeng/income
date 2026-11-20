import { krwExDividendDate } from '../../src/security/ex-dividend-date.js';

/** [from, to]의 평일 중 holidays를 뺀 날 */
const tradingDays = (from: string, to: string, holidays: string[] = []): string[] => {
  const days: string[] = [];
  for (
    let date = new Date(`${from}T00:00:00Z`);
    date <= new Date(`${to}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const iso = date.toISOString().slice(0, 10);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6 && !holidays.includes(iso)) {
      days.push(iso);
    }
  }
  return days;
};

describe('krwExDividendDate', () => {
  it('기준일이 거래일이면 그 직전 거래일', () => {
    // 2025-06-30(월) → 06-27(금)
    expect(krwExDividendDate('2025-06-30', tradingDays('2025-06-01', '2025-07-31'))).toBe(
      '2025-06-27',
    );
    // 2025-03-26(수) → 03-25(화)
    expect(krwExDividendDate('2025-03-26', tradingDays('2025-03-01', '2025-04-30'))).toBe(
      '2025-03-25',
    );
  });

  it('기준일이 휴장일(연말)이면 그 이전 마지막 거래일의 직전 거래일', () => {
    // 2024-12-31(화) 휴장, 12-25 휴장 → 마지막 거래일 12-30(월) → 배당락일 12-27(금)
    const days = tradingDays('2024-12-01', '2025-01-10', ['2024-12-25', '2024-12-31', '2025-01-01']);
    expect(krwExDividendDate('2024-12-31', days)).toBe('2024-12-27');
  });

  it('직전 거래일이 연휴면 연휴를 건너뛴다', () => {
    // 2025-10-10(금) 기준일, 10-03·10-06~10-09 휴장 → 10-02(목)
    const days = tradingDays('2025-09-15', '2025-10-31', [
      '2025-10-03',
      '2025-10-06',
      '2025-10-07',
      '2025-10-08',
      '2025-10-09',
    ]);
    expect(krwExDividendDate('2025-10-10', days)).toBe('2025-10-02');
  });

  it('거래일 목록이 기준일을 덮지 못하면(미래·수집 전) 주말만 건너뛰는 평일 계산', () => {
    // 목록이 기준일 전에 끝남: 2026-12-31(목) → 12-30(수)
    expect(krwExDividendDate('2026-12-31', tradingDays('2026-11-01', '2026-11-30'))).toBe(
      '2026-12-30',
    );
    // 목록 없음, 기준일 월요일 → 직전 금요일
    expect(krwExDividendDate('2025-06-30', [])).toBe('2025-06-27');
    // 기준일 일요일 → 마지막 평일 금요일 → 그 전 목요일
    expect(krwExDividendDate('2025-06-29', [])).toBe('2025-06-26');
    // 목록이 기준일 바로 앞(7일 이내)부터 시작 → 목록을 믿지 않음
    expect(krwExDividendDate('2025-06-30', tradingDays('2025-06-27', '2025-07-31'))).toBe(
      '2025-06-27',
    );
  });
});
