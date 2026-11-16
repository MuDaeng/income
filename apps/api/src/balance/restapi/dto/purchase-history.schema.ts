import { z } from 'zod';
import { SecurityCompany } from '@app/common';

export const purchaseHistorySchema = z.object({
  /** 종목 ISIN 코드 (Security.id) */
  securityId: z.string().trim().min(1, 'ISIN 코드를 입력하세요.'),
  /** 증권사. 생략하면 전체 증권사 */
  securityCompany: z.enum(SecurityCompany).optional(),
});

export type PurchaseHistoryRequest = z.infer<typeof purchaseHistorySchema>;
