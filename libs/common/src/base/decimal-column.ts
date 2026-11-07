import type { ColumnOptions, ValueTransformer } from "typeorm";

/**
 * MySQL DECIMAL은 mysql2가 문자열로 돌려주므로 읽을 때 number로 변환.
 * 계산은 JS number(부동소수점)로 하게 되니, 금액을 여러 번 더하거나 곱할 때는 반올림에 주의
 */
const decimalTransformer: ValueTransformer = {
    to: (value?: number | null) => value,
    from: (value?: string | null) => (value === null || value === undefined ? value : Number(value)),
};

/** 가격·수량·배당금 컬럼 공통 옵션: DECIMAL(20, 6), TS 타입은 number */
export const decimalColumn: ColumnOptions = {
    type: 'decimal',
    precision: 20,
    scale: 6,
    transformer: decimalTransformer,
};
