import { Decimal } from 'decimal.js';
import { z } from 'zod';

const DECIMAL_STRING = /^\d+(\.\d+)?$/;

/** 0보다 큰 십진수 문자열 (예: '10', '0.123456'). decimal은 string으로 받음 */
export const positiveDecimalString = z
  .string()
  .regex(DECIMAL_STRING, '숫자 문자열이어야 합니다. (예: "10", "123.45")')
  // Zod 4는 regex가 실패해도 refine을 실행하므로, 형식이 틀린 값은 여기서 건너뜀 (new Decimal('abc')는 예외)
  .refine(
    (value) => !DECIMAL_STRING.test(value) || new Decimal(value).gt(0),
    '0보다 커야 합니다.',
  );

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 매도일이 매수일과 같거나 이후인지. 'YYYY-MM-DD'는 문자열 비교가 날짜 순서와 같음.
 * 형식이 틀린 값은 각 필드 검증이 잡으므로 건너뜀 (Zod 4는 필드 검증이 실패해도 object refine을 실행할 수 있음)
 */
export function isSaleDateNotBeforePurchaseDate({
  purchaseDate,
  saleDate,
}: {
  purchaseDate: string;
  saleDate?: string | null;
}): boolean {
  return (
    !saleDate ||
    !ISO_DATE.test(saleDate) ||
    !ISO_DATE.test(purchaseDate) ||
    saleDate >= purchaseDate
  );
}

export const SALE_DATE_BEFORE_PURCHASE_DATE_ERROR = {
  message: '매도일은 매수일과 같거나 이후여야 합니다.',
  path: ['saleDate'],
};

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
    /** 구매 환율(1 USD당 원화). KRW 종목은 무시, USD 종목에서 생략하면 매수일(이전 최근) USD 종가 환율 */
    exchangeRate: positiveDecimalString.nullish(),
  })
  .refine(isSaleDateNotBeforePurchaseDate, SALE_DATE_BEFORE_PURCHASE_DATE_ERROR);

export type RegisterBalanceRequest = z.infer<typeof registerBalanceSchema>;
