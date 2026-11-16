import { z } from 'zod';
import { SecurityCompany } from '@app/common';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const periodReturnSchema = z
  .object({
    /** 조회 시작일 'YYYY-MM-DD' (배당 지급일 기간의 시작) */
    from: z.iso.date(),
    /** 조회 종료일 'YYYY-MM-DD' (평가 기준일, 배당 지급일 기간의 끝) */
    to: z.iso.date(),
    /** 증권사. 생략하면 전체 증권사 */
    securityCompany: z.enum(SecurityCompany).optional(),
  })
  // 'YYYY-MM-DD'는 문자열 비교가 날짜 순서와 같음. 형식이 틀린 값은 필드 검증이 잡으므로 건너뜀
  .refine(
    ({ from, to }) =>
      typeof from !== 'string' ||
      typeof to !== 'string' ||
      !ISO_DATE.test(from) ||
      !ISO_DATE.test(to) ||
      from <= to,
    { message: '시작일은 종료일과 같거나 이전이어야 합니다.', path: ['from'] },
  );

export type PeriodReturnRequest = z.infer<typeof periodReturnSchema>;
