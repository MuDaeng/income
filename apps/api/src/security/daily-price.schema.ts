import { z } from 'zod';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const dailyPriceSchema = z
  .object({
    /** 종목 ISIN 코드 (Security.id, 완전일치) */
    securityId: z.string().trim().min(1, 'ISIN 코드를 입력하세요.'),
    /** 시작일 'YYYY-MM-DD'. 생략하면 처음부터 */
    from: z.iso.date().optional(),
    /** 종료일 'YYYY-MM-DD'. 생략하면 끝까지 */
    to: z.iso.date().optional(),
  })
  // 'YYYY-MM-DD'는 문자열 비교가 날짜 순서와 같음. 형식이 틀린 값은 필드 검증이 잡으므로 건너뜀
  .refine(
    ({ from, to }) =>
      !from || !to || !ISO_DATE.test(from) || !ISO_DATE.test(to) || from <= to,
    { message: '시작일은 종료일과 같거나 이전이어야 합니다.', path: ['from'] },
  );

export type DailyPriceRequest = z.infer<typeof dailyPriceSchema>;
