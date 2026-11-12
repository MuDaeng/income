import { z } from 'zod';

export const searchSecuritiesSchema = z.object({
  /** symbol(완전일치) 또는 종목명(부분일치). ISIN으로는 검색하지 않음 */
  keyword: z.string().trim().min(1, 'symbol 또는 종목명을 입력하세요.'),
});

export type SearchSecuritiesRequest = z.infer<typeof searchSecuritiesSchema>;
