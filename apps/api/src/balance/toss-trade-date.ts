import { krwTradingDayBefore } from '../security/trading-day.js';

/** Toss settlementDate(결제일)는 체결일보다 이만큼 거래일 늦다 */
const TOSS_SETTLEMENT_LAG_DAYS = 2;

/**
 * Toss 거래 한 건의 체결일(매수일·매도일) 'YYYY-MM-DD'.
 * Toss의 settlementDate는 실제 체결일보다 2거래일 늦으므로 settlementDate에서 2거래일 앞당긴다.
 * tradingDays(오름차순 KRX 거래일)가 그 날짜를 덮지 못하면 평일(토·일 제외)로 계산한다.
 */
export function tossTradeDate(
  settlementDate: string,
  tradingDays: string[],
): string {
  return krwTradingDayBefore(
    settlementDate,
    TOSS_SETTLEMENT_LAG_DAYS,
    tradingDays,
  );
}
