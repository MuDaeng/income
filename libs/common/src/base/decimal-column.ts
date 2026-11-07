import type { ColumnOptions } from "typeorm";

/**
 * 가격·수량·배당금 컬럼 공통 옵션: DECIMAL(20, 6).
 * mysql2가 DECIMAL을 문자열로 돌려주므로 TS 타입은 string('123.450000').
 * 계산은 number로 바꾸지 말고 decimal.js로 하고, 저장 전 자릿수는 `truncateByCurrency`로 맞춘다
 */
export const decimalColumn: ColumnOptions = {
    type: 'decimal',
    precision: 20,
    scale: 6,
};
