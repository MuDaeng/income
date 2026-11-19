import { tossTradeDate } from '../../src/balance/toss-trade-date.js';

const tx = (marketCountry: string, transactionTime: string | null) => ({
  marketCountry,
  transactionTime,
  settlementDate: '2026-09-18',
});

describe('tossTradeDate', () => {
  it.each(['2026-10-16T00:00:00+09:00', '2026-10-16T21:59:59+09:00', '2026-10-16T23:59:59+09:00'])(
    '국내는 KST 날짜 그대로 (%s)',
    (time) => {
      expect(tossTradeDate(tx('KR', time))).toBe('2026-10-16');
    },
  );

  it.each(['2026-10-16T22:00:00+09:00', '2026-10-16T23:59:59+09:00'])(
    '미국 22:00~23:59:59는 당일 (%s)',
    (time) => {
      expect(tossTradeDate(tx('US', time))).toBe('2026-10-16');
    },
  );

  it.each([
    '2026-10-16T00:00:00+09:00',
    '2026-10-16T06:30:00+09:00',
    '2026-10-16T21:59:59+09:00',
  ])('미국 00:00~21:59:59는 전날 (%s)', (time) => {
    expect(tossTradeDate(tx('US', time))).toBe('2026-10-15');
  });

  it('목록 밖의 시장도 미국 규칙', () => {
    expect(tossTradeDate(tx('JP', '2026-10-16T06:30:00+09:00'))).toBe(
      '2026-10-15',
    );
  });

  it('미국 전날은 월·연 경계를 넘는다', () => {
    expect(tossTradeDate(tx('US', '2026-01-01T05:00:00+09:00'))).toBe(
      '2025-12-31',
    );
    expect(tossTradeDate(tx('US', '2026-03-01T05:00:00+09:00'))).toBe(
      '2026-02-28',
    );
  });

  it('다른 오프셋이어도 KST로 환산한다', () => {
    // UTC 13:30 = KST 22:30 → 당일
    expect(tossTradeDate(tx('US', '2026-10-16T13:30:00Z'))).toBe('2026-10-16');
  });

  it('transactionTime이 null(미결제)이면 settlementDate', () => {
    expect(tossTradeDate(tx('US', null))).toBe('2026-09-18');
    expect(tossTradeDate(tx('KR', null))).toBe('2026-09-18');
  });
});
