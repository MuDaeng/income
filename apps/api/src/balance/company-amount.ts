import { Decimal } from 'decimal.js';
import {
  Currency,
  PurchaseDateBalance,
  SecurityCompany,
  truncateByCurrency,
} from '@app/common';
import type { CompanyAmountDto } from './dto/company-amount.dto.js';

/**
 * 매수분들의 증권사별 수량 합. 넘긴 행을 그대로 더하므로 미매도 행만 넘긴다.
 * 수량이 0보다 큰 증권사만, SecurityCompany enum 선언 순서로, 종목 통화 기준으로 버림한다.
 */
export function companyAmountsOf(
  rows: Pick<PurchaseDateBalance, 'securityCompany' | 'amount'>[],
  currency: Currency,
): CompanyAmountDto[] {
  const sums = new Map<SecurityCompany, Decimal>();
  for (const row of rows) {
    sums.set(
      row.securityCompany,
      (sums.get(row.securityCompany) ?? new Decimal(0)).plus(row.amount),
    );
  }
  return Object.values(SecurityCompany)
    .filter((company) => sums.get(company)?.gt(0))
    .map((company) => ({
      securityCompany: company,
      amount: truncateByCurrency(sums.get(company)!, currency),
    }));
}
