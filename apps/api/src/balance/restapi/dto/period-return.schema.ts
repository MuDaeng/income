import { z } from 'zod';
import { DATE_RANGE_ERROR, isOrderedDateRange } from '@app/common';

export const periodReturnSchema = z
  .object({
    /** 조회 시작일 'YYYY-MM-DD' (배당 지급일 기간의 시작). 생략하면 처음부터 (모든 매수분의 기준금액 = 원금) */
    from: z.iso.date().optional(),
    /** 조회 종료일 'YYYY-MM-DD' (평가 기준일, 배당 지급일 기간의 끝). 생략하면 오늘(Asia/Seoul) */
    to: z.iso.date().optional(),
    /** 계좌 id (GET /accounts). 생략하면 전체 계좌 */
    accountId: z.coerce.number().int().positive().optional(),
  })
  .refine(isOrderedDateRange, DATE_RANGE_ERROR);

export type PeriodReturnRequest = z.infer<typeof periodReturnSchema>;
