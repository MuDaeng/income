import { z } from 'zod';
import { SecurityCompany } from '@app/common';
import { positiveDecimalString } from './register-balance.schema.js';

export const bulkSellBalanceSchema = z.object({
  securityId: z.string().min(1),
  /** 매도할 매수분의 증권사 */
  securityCompany: z.enum(SecurityCompany),
  /** 매도 수량 (매수일이 오래된 매수분부터 차례로 뺌) */
  amount: positiveDecimalString,
  /** 매도일 'YYYY-MM-DD'. 이날 이전(포함)에 산 매수분만 매도한다 */
  saleDate: z.iso.date(),
});

export type BulkSellBalanceRequest = z.infer<typeof bulkSellBalanceSchema>;
