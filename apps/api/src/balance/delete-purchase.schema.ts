import { z } from 'zod';

/** 잘못 등록한 매수분 하나 삭제 (DELETE /balance/purchases 쿼리) */
export const deletePurchaseSchema = z.object({
  /** 종목 ISIN 코드 (Security.id) */
  securityId: z.string().trim().min(1, 'ISIN 코드를 입력하세요.'),
  /** 삭제할 매수분의 매수일 'YYYY-MM-DD' */
  purchaseDate: z.iso.date(),
  /** 삭제할 매수분의 sequence (같은 매수일 안의 순번). 쿼리 문자열이라 숫자로 변환 */
  sequence: z.coerce.number().int().positive(),
});

export type DeletePurchaseRequest = z.infer<typeof deletePurchaseSchema>;
