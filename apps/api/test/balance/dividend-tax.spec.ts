import { AccountType, Currency } from '@app/common';
import {
  DIVIDEND_TAX_RATES,
  dividendTax,
  isTaxedAccount,
} from '../../src/balance/dividend-tax.js';

describe('dividend-tax', () => {
  it('세율: KRW 15.4%, USD 15%', () => {
    expect(DIVIDEND_TAX_RATES).toEqual({
      [Currency.KRW]: '0.154',
      [Currency.USD]: '0.15',
    });
  });

  it('세금은 종목 통화로 버린다 (KRW 정수, USD 소수 6자리)', () => {
    expect(dividendTax('4693', Currency.KRW)).toBe('722'); // 722.722
    expect(dividendTax('0.333333', Currency.USD)).toBe('0.049999'); // 0.04999995
    expect(dividendTax('0', Currency.KRW)).toBe('0');
  });

  it('일반 계좌만 과세', () => {
    expect(isTaxedAccount(AccountType.NORMAL)).toBe(true);
    expect(isTaxedAccount(AccountType.ISA)).toBe(false);
    expect(isTaxedAccount(AccountType.IRP)).toBe(false);
    expect(isTaxedAccount(AccountType.PS)).toBe(false);
  });
});
