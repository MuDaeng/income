import { Decimal } from 'decimal.js';

/** 금액 문자열들의 합. null(환율 없음 등)은 건너뛴다 */
export const sumDecimals = (values: (string | null)[]): Decimal =>
  values.reduce<Decimal>(
    (acc, value) => (value === null ? acc : acc.plus(value)),
    new Decimal(0),
  );
