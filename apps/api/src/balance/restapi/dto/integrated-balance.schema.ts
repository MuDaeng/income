import { z } from 'zod';

export const integratedBalanceSchema = z.object({
  /** 계좌 id (GET /accounts). 생략하면 전체 계좌 */
  accountId: z.coerce.number().int().positive().optional(),
});

export type IntegratedBalanceRequest = z.infer<typeof integratedBalanceSchema>;
