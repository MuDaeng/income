export enum Currency {USD = 'USD', KRW = 'KRW'}

/**
 * 잔고·수익률·배당 계산이 다루는 통화. 통화를 새로 지원하려면 여기에 더하고
 * 시세 기준일·세율·소수 자릿수(currency-decimal.ts)도 함께 정한다.
 */
const SUPPORTED_CURRENCIES: ReadonlySet<string> = new Set([Currency.KRW, Currency.USD]);

/** 계산 대상 통화인지 (DB에 알 수 없는 통화 값이 있어도 건너뛰도록) */
export const isSupportedCurrency = (currency: string): currency is Currency =>
    SUPPORTED_CURRENCIES.has(currency);
