import type { TossTransactionRequest } from './restapi/dto/bulk-register-balance-toss.schema.js';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** 미국 거래가 KST로 이 시각(22:00) 이후면 그날, 이전이면 전날 거래로 본다 */
const US_SAME_DAY_FROM_HOUR = 22;

/**
 * Toss 거래 한 건의 매수일·매도일 'YYYY-MM-DD' (KST).
 * - transactionTime이 없으면(미결제) settlementDate 그대로
 * - 국내(marketCountry KR): transactionTime의 KST 날짜
 * - 그 외(미국): KST 22:00:00~23:59:59면 그 날짜, 00:00:00~21:59:59면 전날
 */
export function tossTradeDate(
  transaction: Pick<
    TossTransactionRequest,
    'marketCountry' | 'transactionTime' | 'settlementDate'
  >,
): string {
  const { transactionTime, settlementDate, marketCountry } = transaction;
  if (transactionTime === null) {
    return settlementDate;
  }
  // KST 벽시계를 UTC 필드로 읽기 위해 9시간 더함 (입력 오프셋이 +09:00이 아니어도 KST로 환산됨)
  const kst = new Date(Date.parse(transactionTime) + KST_OFFSET_MS);
  const date =
    marketCountry === 'KR' || kst.getUTCHours() >= US_SAME_DAY_FROM_HOUR
      ? kst
      : new Date(kst.getTime() - DAY_MS);
  return date.toISOString().slice(0, 10);
}
