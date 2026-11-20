import { addDays, parseIsoDate } from './iso-date.js';

/** 그 날짜가 토·일인지 (UTC 날짜 기준) */
const isWeekend = (isoDate: string): boolean => {
  const day = parseIsoDate(isoDate).getUTCDay();
  return day === 0 || day === 6;
};

/** date(포함) 이전 가장 가까운 평일 */
const weekdayOnOrBefore = (isoDate: string): string => {
  let date = isoDate;
  while (isWeekend(date)) {
    date = addDays(date, -1);
  }
  return date;
};

/** 오름차순 목록에서 date(포함) 이전 마지막 값의 인덱스, 없으면 -1 (이진 탐색) */
const lastIndexOnOrBefore = (sorted: string[], date: string): number => {
  let lo = 0;
  let hi = sorted.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= date) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
};

/** 거래일 목록이 이만큼 기준일 앞부터 있어야 그 목록으로 계산한다 (시세 수집 시작 직후의 빈 구간 방지) */
const MIN_COVERAGE_DAYS = 7;

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
): string => {
  const covered =
    tradingDays.length > 0 &&
    tradingDays[tradingDays.length - 1] >= recordDate &&
    tradingDays[0] <= addDays(recordDate, -MIN_COVERAGE_DAYS);
  if (covered) {
    const last = lastIndexOnOrBefore(tradingDays, recordDate);
    if (last >= 1) {
      return tradingDays[last - 1];
    }
  }
  return weekdayOnOrBefore(addDays(weekdayOnOrBefore(recordDate), -1));
};
