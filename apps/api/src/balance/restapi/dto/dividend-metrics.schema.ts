import { z } from 'zod';

export const dividendMetricsSchema = z.object({
  /** 계좌 id (GET /accounts). 생략하면 전체 계좌 */
  accountId: z.coerce.number().int().positive().optional(),
});

export type DividendMetricsRequest = z.infer<typeof dividendMetricsSchema>;
