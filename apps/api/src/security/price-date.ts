import { addDays, Currency, krwPriceDate } from '@app/common';

/**
 * 한국 날짜 date 기준으로 확정된 종가를 찾을 때 볼 마지막 시세 날짜 (그 날짜 이전 최근 종가를 찾는다).
 * - USD: 시세는 미국 거래일 날짜로 저장되고 미국 D일 종가는 한국 D+1 새벽에 확정 → date − 1
 * - KRW: krwPriceDate()를 넘지 않음 (15:30 장 마감 전이면 오늘 대신 전날까지)
 * 시장(통화)을 새로 지원하면 그 시장의 마감 규칙을 여기에 더한다.
 */
export const priceLookupDate = (
  currency: Currency,
  date: string,
  now: Date = new Date(),
): string => {
  if (currency === Currency.USD) {
    return addDays(date, -1);
  }
  const confirmed = krwPriceDate(now);
  return date < confirmed ? date : confirmed;
};
