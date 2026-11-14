import { z } from 'zod';
import { positiveDecimalString } from './register-balance.schema.js';

/** 매수분 하나의 구매 환율 수정 (PATCH /balance/purchases 본문) */
export const updateExchangeRateSchema = z.object({
  /** 종목 ISIN 코드 (Security.id) */
  securityId: z.string().trim().min(1, 'ISIN 코드를 입력하세요.'),
  /** 수정할 매수분의 매수일 'YYYY-MM-DD' */
  purchaseDate: z.iso.date(),
  /** 수정할 매수분의 sequence (같은 매수일 안의 순번) */
  sequence: z.number().int().positive(),
  /** 구매 환율(1 USD당 원화). null이면 저장 환율을 지워 조회 시 매수일 환율로 계산 */
  exchangeRate: positiveDecimalString.nullable(),
});

export type UpdateExchangeRateRequest = z.infer<typeof updateExchangeRateSchema>;
