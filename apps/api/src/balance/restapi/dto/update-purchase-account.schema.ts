import { z } from 'zod';

/** 매수분 하나의 계좌 이동 (PATCH /balance/purchases/account 본문) */
export const updatePurchaseAccountSchema = z.object({
  /** 종목 ISIN 코드 (Security.id) */
  securityId: z.string().trim().min(1, 'ISIN 코드를 입력하세요.'),
  /** 옮길 매수분의 매수일 'YYYY-MM-DD' */
  purchaseDate: z.iso.date(),
  /** 옮길 매수분의 sequence (같은 매수일 안의 순번) */
  sequence: z.number().int().positive(),
  /** 옮겨 갈 내 계좌 id (GET /accounts) */
  accountId: z.number().int().positive(),
});

export type UpdatePurchaseAccountRequest = z.infer<
  typeof updatePurchaseAccountSchema
>;
