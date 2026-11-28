import { z } from 'zod';
import { DATE_RANGE_ERROR, isOrderedDateRange } from '@app/common';

export const dailyPriceSchema = z
  .object({
    /** 종목 ISIN 코드 (Security.id, 완전일치) */
    securityId: z.string().trim().min(1, 'ISIN 코드를 입력하세요.'),
    /** 시작일 'YYYY-MM-DD'. 생략하면 처음부터 */
    from: z.iso.date().optional(),
    /** 종료일 'YYYY-MM-DD'. 생략하면 끝까지 */
    to: z.iso.date().optional(),
  })
  .refine(isOrderedDateRange, DATE_RANGE_ERROR);

export type DailyPriceRequest = z.infer<typeof dailyPriceSchema>;
