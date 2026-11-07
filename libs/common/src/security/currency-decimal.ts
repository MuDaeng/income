import {Decimal} from "decimal.js";
import {Currency} from "./currency.enum.js";

/** 통화별 소수 자릿수: 원화(국내 주식·채권 등)는 정수, 해외(USD)는 decimalColumn의 scale과 같은 6자리 */
const DECIMAL_PLACES: Record<Currency, number> = {
    [Currency.KRW]: 0,
    [Currency.USD]: 6,
};

export function decimalPlacesOf(currency: Currency): number {
    return DECIMAL_PLACES[currency];
}

/**
 * 가격·수량·배당금을 통화별 자릿수로 버림(ROUND_DOWN)해서 DB에 저장할 문자열로 만든다.
 * 예) KRW: '1234.6' → '1234', USD: '0.1234567' → '0.123456'
 */
export function truncateByCurrency(value: Decimal.Value, currency: Currency): string {
    const places = decimalPlacesOf(currency);
    return new Decimal(value).toDecimalPlaces(places, Decimal.ROUND_DOWN).toFixed(places);
}
