import { z } from 'zod';

/** 거래 유형 (Toss `transactionType`) */
export const TOSS_TRANSACTION_TYPES = [
  'BUY',
  'SELL',
  'SECURITIES_TRANSFER_IN',
  'SECURITIES_TRANSFER_OUT',
  'DEPOSIT',
  'WITHDRAWAL',
  'EXCHANGE_IN',
  'EXCHANGE_OUT',
  'DIVIDEND',
  'INTEREST',
  'FEE',
] as const;

/** 시장 국가 구분 (KR: KRX, US: NYSE·NASDAQ 등) */
export const TOSS_MARKET_COUNTRIES = ['KR', 'US'] as const;

/** 통화 코드 */
export const TOSS_CURRENCIES = ['KRW', 'USD'] as const;

/** 거래 상품군. ETF·리츠·ETN은 STOCK */
export const TOSS_ASSET_CLASSES = ['STOCK', 'BOND', 'OPTION'] as const;

/**
 * 알려진 값 + 그 밖의 문자열. Toss는 enum에 값을 추가할 수 있어 클라이언트가 모르는 값도 받아야 하므로
 * 목록 밖의 값도 허용한다 (`string & {}`는 알려진 값의 자동완성을 남기기 위함)
 */
export type LenientEnum<T extends string> = T | (string & {});

export type TossTransactionType = LenientEnum<
  (typeof TOSS_TRANSACTION_TYPES)[number]
>;
export type TossMarketCountry = LenientEnum<
  (typeof TOSS_MARKET_COUNTRIES)[number]
>;
export type TossCurrency = LenientEnum<(typeof TOSS_CURRENCIES)[number]>;
export type TossAssetClass = LenientEnum<(typeof TOSS_ASSET_CLASSES)[number]>;

/** 느슨한 enum: 비어 있지 않은 문자열이면 위 TOSS_* 목록에 없는 값도 통과 */
const lenientEnum = z.string().min(1);

/** 0 이상 십진수 문자열 (Toss 금액·수량은 부호 없음, 최대 30자). decimal은 string으로 받음 */
const unsignedDecimalString = z
  .string()
  .max(30)
  .regex(/^\d+(\.\d+)?$/, '숫자 문자열이어야 합니다. (예: "10", "123.45")');

/** Toss 거래내역 한 건. 모든 금액은 `currency` 통화 */
export const tossTransactionSchema = z.object({
  /** 거래 유형. 취소 거래는 원거래의 유형을 유지 */
  transactionType: lenientEnum,
  /** 거래가 속한 시장 */
  marketCountry: lenientEnum,
  /** 이 거래의 모든 금액이 표시된 통화 */
  currency: lenientEnum,
  /** 종목 심볼. 채권·현금 거래는 null */
  symbol: z.string().min(1).nullable(),
  /** 거래 상품군. 종목과 관련 없는 현금 거래는 null */
  assetClass: lenientEnum.nullable(),
  /** 거래 시점의 ISIN. 옵션·현금 거래는 null */
  isinCode: z.string().min(1).nullable(),
  /** 수량. BUY·SELL·증권 입출고 외에는 null */
  quantity: unsignedDecimalString.nullable(),
  /** 매매 단가. BUY·SELL 외, 미결제는 null */
  filledPrice: unsignedDecimalString.nullable(),
  /** 거래금액. 증권 입출고는 null */
  amount: unsignedDecimalString.nullable(),
  /** 수수료. 없으면 "0" */
  commission: unsignedDecimalString,
  /** 세금 합계. 없으면 "0" */
  tax: unsignedDecimalString,
  /** 수수료·세금을 반영한 정산 금액. 증권 입출고는 null */
  netAmount: unsignedDecimalString.nullable(),
  /** 환율 (1 USD당 KRW). USD 결제 완료 거래 외에는 null */
  exchangeRate: unsignedDecimalString.nullable(),
  /** KST 기준 결제일 'YYYY-MM-DD'. 미결제는 예상 결제일 */
  settlementDate: z.iso.date(),
  /** 결제 완료 여부 */
  settled: z.boolean(),
  /** 결제 완료 내역의 거래 처리일시 (ISO 8601, +09:00). 미결제는 null */
  transactionTime: z.iso.datetime({ offset: true }).nullable(),
  /** 국내 거래의 취소 여부 */
  isCancellation: z.boolean(),
});

export const bulkRegisterBalanceTossSchema = z.object({
  /** Toss 거래내역 조회 응답의 `transactions` */
  transactionList: z.array(tossTransactionSchema).min(1),
});

export type TossTransactionRequest = z.infer<typeof tossTransactionSchema>;
export type BulkRegisterBalanceTossRequest = z.infer<
  typeof bulkRegisterBalanceTossSchema
>;
