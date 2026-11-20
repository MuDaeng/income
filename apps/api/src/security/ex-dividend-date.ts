import { krwTradingDayBefore } from './trading-day.js';

/**
 * 국내 배당락일. 국내는 T+2 결제라 기준일(record date)에 주주명부에 오르려면 결제일 기준 2영업일 전까지 사야 하고,
 * 배당락일은 기준일 이전(포함) 마지막 거래일의 직전 거래일이다.
 * 예: 기준일 2024-12-31(휴장) → 마지막 거래일 12-30 → 배당락일 12-27.
 *
 * tradingDays(오름차순 'YYYY-MM-DD' KRX 거래일)가 기준일을 덮으면(마지막 거래일 >= 기준일, 첫 거래일이 기준일보다
 * 7일 이상 앞) 그 목록으로, 아니면(미래 기준일, 시세 수집 전 구간) 주말만 건너뛰는 평일 계산으로 대체한다.
 */
export const krwExDividendDate = (
  recordDate: string,
  tradingDays: string[],
): string => krwTradingDayBefore(recordDate, 1, tradingDays);
