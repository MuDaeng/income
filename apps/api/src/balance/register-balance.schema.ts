import { Decimal } from 'decimal.js';
import { z } from 'zod';

const DECIMAL_STRING = /^\d+(\.\d+)?$/;

/** 0보다 큰 십진수 문자열 (예: '10', '0.123456'). decimal은 string으로 받음 */
const positiveDecimalString = z
  .string()
  .regex(DECIMAL_STRING, '숫자 문자열이어야 합니다. (예: "10", "123.45")')
  // Zod 4는 regex가 실패해도 refine을 실행하므로, 형식이 틀린 값은 여기서 건너뜀 (new Decimal('abc')는 예외)
  .refine(
    (value) => !DECIMAL_STRING.test(value) || new Decimal(value).gt(0),
    '0보다 커야 합니다.',
  );

export const registerBalanceSchema = z.object({
  securityId: z.string().min(1),
  /** 'YYYY-MM-DD' */
  purchaseDate: z.iso.date(),
  /** 수량 */
  amount: positiveDecimalString,
  /** 매수 단가 */
  price: positiveDecimalString,
});

export type RegisterBalanceRequest = z.infer<typeof registerBalanceSchema>;
