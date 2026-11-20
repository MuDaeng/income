import { Decimal } from 'decimal.js';

/** 수익률(%) = (평가 − 매입) / 매입 × 100, 소수 2자리 버림. 매입이 0이면 '0.00' */
export const returnRate = (
  purchase: Decimal.Value,
  evaluation: Decimal.Value,
): string => {
  const cost = new Decimal(purchase);
  if (cost.isZero()) {
    return '0.00';
  }
  return new Decimal(evaluation)
    .minus(cost)
    .dividedBy(cost)
    .times(100)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN)
    .toFixed(2);
};

/** 비율(%) = part / whole × 100, 소수 2자리 버림. whole이 0이면 null (배당률·YOC 등) */
export const percentOf = (
  part: Decimal.Value,
  whole: Decimal.Value,
): string | null => {
  const base = new Decimal(whole);
  if (base.isZero()) {
    return null;
  }
  return new Decimal(part)
    .dividedBy(base)
    .times(100)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN)
    .toFixed(2);
};
