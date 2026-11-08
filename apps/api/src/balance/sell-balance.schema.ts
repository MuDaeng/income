import { z } from 'zod';
import {
  isSaleDateNotBeforePurchaseDate,
  positiveDecimalString,
  SALE_DATE_BEFORE_PURCHASE_DATE_ERROR,
} from './register-balance.schema.js';

export const sellBalanceSchema = z
  .object({
    securityId: z.string().min(1),
    /** 매도할 매수분의 매수일 'YYYY-MM-DD' */
    purchaseDate: z.iso.date(),
    /** 매도할 매수분의 sequence (같은 매수일 안의 순번) */
    sequence: z.number().int().positive(),
    /** 매도 수량 */
    amount: positiveDecimalString,
    /** 매도일 'YYYY-MM-DD' */
    saleDate: z.iso.date(),
  })
  .refine(isSaleDateNotBeforePurchaseDate, SALE_DATE_BEFORE_PURCHASE_DATE_ERROR);

export type SellBalanceRequest = z.infer<typeof sellBalanceSchema>;
