import { z } from 'zod';
import { SecurityCompany } from '@app/common';

export const integratedBalanceSchema = z.object({
  /** 증권사. 생략하면 전체 증권사 */
  securityCompany: z.enum(SecurityCompany).optional(),
});

export type IntegratedBalanceRequest = z.infer<typeof integratedBalanceSchema>;
