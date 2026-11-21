import { Decimal } from 'decimal.js';
import { AccountType, Currency, truncateByCurrency } from '@app/common';

/**
 * 배당 원천징수 세율 (일반 계좌).
 * - KRW: 배당소득세 14% + 지방소득세 1.4% = 15.4%
 * - USD: 미국 원천징수 15% (국내 세율 14%보다 높아 국내 추가 과세 없음)
 */
export const DIVIDEND_TAX_RATES: Record<Currency.KRW | Currency.USD, string> = {
  [Currency.KRW]: '0.154',
  [Currency.USD]: '0.15',
};

/**
 * 배당을 받을 때 원천징수되는 계좌인지. 일반 계좌만 과세하고,
 * ISA·IRP·연금저축은 받을 때 떼지 않으므로(만기·수령 시 과세는 반영 안 함) 세후 = 세전
 */
export const isTaxedAccount = (accountType: AccountType): boolean =>
  accountType === AccountType.NORMAL;

/** 과세 대상 배당금의 세금 (종목 통화로 버림. 원천징수의 10원 미만 절사는 따르지 않음) */
export const dividendTax = (
  taxableAmount: Decimal.Value,
  currency: Currency.KRW | Currency.USD,
): string =>
  truncateByCurrency(
    new Decimal(taxableAmount).times(DIVIDEND_TAX_RATES[currency]),
    currency,
  );
