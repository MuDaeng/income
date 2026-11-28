import {Decimal} from "decimal.js";
import {Currency} from "./currency.enum.js";

/** 통화별 소수 자릿수: 원화(국내 주식·채권 등)는 정수, 해외(USD)는 decimalColumn의 scale과 같은 6자리 */
const DECIMAL_PLACES: Record<Currency, number> = {
    [Currency.KRW]: 0,
    [Currency.USD]: 6,
};

/** decimalColumn(DECIMAL(20, 6))의 소수 자릿수 */
const COLUMN_SCALE = 6;

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

/**
 * 환율·비율(%)처럼 통화와 무관하게 컬럼 자릿수(소수 6자리)로 버림한다.
 * truncateByCurrency(KRW)를 쓰면 정수로 잘리므로 따로 둔다. 예) '1400.1234567' → '1400.123456'
 */
export function truncateRate(value: Decimal.Value): string {
    return new Decimal(value).toDecimalPlaces(COLUMN_SCALE, Decimal.ROUND_DOWN).toFixed(COLUMN_SCALE);
}

/**
 * 원천(KIS·data.go.kr) 응답의 원화 가격 문자열 → 원화 정수 버림.
 * 빈 값이면 new Decimal('')가 예외라 0으로 둔다 (거래정지 종목은 원천에서도 0)
 */
export function parseKrwPrice(value: string | undefined): string {
    return toKrw(value?.trim() || '0');
}

/** 원화 금액: 정수로 버림 (= truncateByCurrency(value, KRW)) */
export function toKrw(value: Decimal.Value): string {
    return truncateByCurrency(value, Currency.KRW);
}

/** 달러 금액: 소수 6자리로 버림 (= truncateByCurrency(value, USD)) */
export function toUsd(value: Decimal.Value): string {
    return truncateByCurrency(value, Currency.USD);
}
