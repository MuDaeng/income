import { z } from 'zod';
import { SecurityCompany } from '@app/common';

export const dividendMetricsSchema = z.object({
  /** 증권사. 생략하면 전체 증권사 */
  securityCompany: z.enum(SecurityCompany).optional(),
});

export type DividendMetricsRequest = z.infer<typeof dividendMetricsSchema>;
