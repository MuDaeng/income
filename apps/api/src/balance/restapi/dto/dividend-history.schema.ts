import { z } from 'zod';
import { DATE_RANGE_ERROR, isOrderedDateRange } from '@app/common';

export const dividendHistorySchema = z
  .object({
    /** 조회 시작일(지급일 기준) 'YYYY-MM-DD'. 생략하면 처음부터 */
    from: z.iso.date().optional(),
    /** 조회 종료일(지급일 기준) 'YYYY-MM-DD'. 생략하면 끝까지(지급 예정 포함) */
    to: z.iso.date().optional(),
    /** 계좌 id (GET /accounts). 생략하면 전체 계좌 (그 계좌 매수분의 보유 수량으로 배당 계산) */
    accountId: z.coerce.number().int().positive().optional(),
  })
  .refine(isOrderedDateRange, DATE_RANGE_ERROR);

export type DividendHistoryRequest = z.infer<typeof dividendHistorySchema>;
