import { z } from 'zod';
import { SecurityCompany } from '@app/common';

export const accountListSchema = z.object({
  /** 증권사. 생략하면 전체 계좌 */
  securityCompany: z.enum(SecurityCompany).optional(),
});

export type AccountListRequest = z.infer<typeof accountListSchema>;
