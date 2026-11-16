import { z } from 'zod';

export const monthlyDividendSchema = z.object({
  /** 종목 ISIN 코드 (Security.id, 완전일치) */
  securityId: z.string().trim().min(1, 'ISIN 코드를 입력하세요.'),
});

export type MonthlyDividendRequest = z.infer<typeof monthlyDividendSchema>;
