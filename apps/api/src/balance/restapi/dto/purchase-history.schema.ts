import { z } from 'zod';

export const purchaseHistorySchema = z.object({
  /** 종목 ISIN 코드 (Security.id) */
  securityId: z.string().trim().min(1, 'ISIN 코드를 입력하세요.'),
  /** 계좌 id (GET /accounts). 생략하면 전체 계좌 */
  accountId: z.coerce.number().int().positive().optional(),
});

export type PurchaseHistoryRequest = z.infer<typeof purchaseHistorySchema>;
