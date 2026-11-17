/** 'YYYY-MM-DD' 날짜 문자열 헬퍼 (모두 UTC 날짜 기준으로 계산) */

/** Date의 UTC 날짜 'YYYY-MM-DD' */
export const formatIsoDate = (date: Date): string =>
  date.toISOString().slice(0, 10);

export const parseIsoDate = (isoDate: string): Date =>
  new Date(`${isoDate}T00:00:00Z`);

export const addDays = (isoDate: string, days: number): string => {
  const date = parseIsoDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDate(date);
};

export const addYears = (isoDate: string, years: number): string => {
  const date = parseIsoDate(isoDate);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return formatIsoDate(date);
};

/** 'YYYY-MM-DD' → 'YYYYMMDD' */
export const toYmd = (isoDate: string): string => isoDate.replaceAll('-', '');

/** 한국 시간 기준 오늘 'YYYY-MM-DD' */
export const todayInSeoul = (): string =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(
    new Date(),
  );

/** 국내 정규장 마감 시각(한국 시간 'HH:mm'). 이 전에는 그날 시세가 아직 확정되지 않음 */
export const KRW_MARKET_CLOSE = '15:30';

/** 조회 API가 KIS로 채울 국내 시세 날짜: 한국 시간 15:30 전이면 어제, 15:30부터 오늘 */
export const krwPriceDate = (now: Date = new Date()): string => {
  const [date, time] = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(now)
    .split(' ');
  return time < KRW_MARKET_CLOSE ? addDays(date, -1) : date;
};
