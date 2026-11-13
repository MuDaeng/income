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
