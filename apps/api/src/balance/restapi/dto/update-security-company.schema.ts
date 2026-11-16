import { z } from 'zod';
import { SecurityCompany } from '@app/common';

/** 매수분 하나의 증권사 수정 (PATCH /balance/purchases/security-company 본문) */
export const updateSecurityCompanySchema = z.object({
  /** 종목 ISIN 코드 (Security.id) */
  securityId: z.string().trim().min(1, 'ISIN 코드를 입력하세요.'),
  /** 수정할 매수분의 매수일 'YYYY-MM-DD' */
  purchaseDate: z.iso.date(),
  /** 수정할 매수분의 sequence (같은 매수일 안의 순번) */
  sequence: z.number().int().positive(),
  /** 바꿀 증권사 */
  securityCompany: z.enum(SecurityCompany),
});

export type UpdateSecurityCompanyRequest = z.infer<typeof updateSecurityCompanySchema>;
