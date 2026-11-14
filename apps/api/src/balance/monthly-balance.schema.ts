import { z } from 'zod';
import { todayInSeoul } from '../security/iso-date.js';

const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
/** 한 번에 조회할 수 있는 최대 개월 수 */
export const MAX_MONTHS = 120;

const yearMonth = z
  .string()
  .regex(YEAR_MONTH, '년월은 YYYY-MM 형식이어야 합니다.');

/** 'YYYY-MM' 두 값 사이의 개월 수 (같은 달이면 1) */
export const monthCount = (from: string, to: string): number => {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
};

const valid = (value: unknown): value is string =>
  typeof value === 'string' && YEAR_MONTH.test(value);

export const monthlyBalanceSchema = z
  .object({
    /** 시작 년월 'YYYY-MM' */
    from: yearMonth,
    /** 종료 년월 'YYYY-MM' (이번 달까지) */
    to: yearMonth,
  })
  // 'YYYY-MM'은 문자열 비교가 날짜 순서와 같음. 형식이 틀린 값은 필드 검증이 잡으므로 건너뜀
  .refine(({ from, to }) => !valid(from) || !valid(to) || from <= to, {
    message: '시작 년월은 종료 년월과 같거나 이전이어야 합니다.',
    path: ['from'],
  })
  .refine(({ to }) => !valid(to) || to <= todayInSeoul().slice(0, 7), {
    message: '종료 년월은 이번 달까지만 조회할 수 있습니다.',
    path: ['to'],
  })
  .refine(
    ({ from, to }) =>
      !valid(from) || !valid(to) || from > to || monthCount(from, to) <= MAX_MONTHS,
    { message: `최대 ${MAX_MONTHS}개월까지 조회할 수 있습니다.`, path: ['from'] },
  );

export type MonthlyBalanceRequest = z.infer<typeof monthlyBalanceSchema>;
