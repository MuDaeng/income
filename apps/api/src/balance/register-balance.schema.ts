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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const registerBalanceSchema = z
  .object({
    securityId: z.string().min(1),
    /** 'YYYY-MM-DD' */
    purchaseDate: z.iso.date(),
    /** 수량 */
    amount: positiveDecimalString,
    /** 매수 단가 */
    price: positiveDecimalString,
    /** 매도일 'YYYY-MM-DD'. 보유 중이면 생략하거나 null */
    saleDate: z.iso.date().nullish(),
  })
  // 'YYYY-MM-DD'는 문자열 비교가 날짜 순서와 같음. 형식이 틀린 값은 각 필드 검증이 잡으므로 건너뜀
  .refine(
    ({ purchaseDate, saleDate }) =>
      !saleDate ||
      !ISO_DATE.test(saleDate) ||
      !ISO_DATE.test(purchaseDate) ||
      saleDate >= purchaseDate,
    { message: '매도일은 매수일과 같거나 이후여야 합니다.', path: ['saleDate'] },
  );

export type RegisterBalanceRequest = z.infer<typeof registerBalanceSchema>;
