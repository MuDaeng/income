import { Decimal } from 'decimal.js';
import {
  type Account,
  type Currency,
  type PurchaseDateBalance,
  truncateByCurrency,
} from '@app/common';
import type { AccountAmountDto } from './restapi/dto/account-amount.dto.js';

/**
 * 매수분들의 계좌별 수량 합. 넘긴 행을 그대로 더하므로 미매도 행만 넘긴다.
 * 수량이 0보다 큰 계좌만, 계좌 id 순으로, 종목 통화 기준으로 버림한다.
 * accounts에 없는 계좌(있을 수 없지만)는 건너뛴다.
 */
export function accountAmountsOf(
  rows: Pick<PurchaseDateBalance, 'accountId' | 'amount'>[],
  accounts: ReadonlyMap<number, Account>,
  currency: Currency,
): AccountAmountDto[] {
  const sums = new Map<number, Decimal>();
  for (const row of rows) {
    sums.set(
      row.accountId,
      (sums.get(row.accountId) ?? new Decimal(0)).plus(row.amount),
    );
  }
  return [...sums.entries()]
    .filter(([id, sum]) => sum.gt(0) && accounts.has(id))
    .sort(([a], [b]) => a - b)
    .map(([id, sum]) => {
      const { securityCompany, accountType } = accounts.get(id)!;
      return {
        accountId: id,
        securityCompany,
        accountType,
        amount: truncateByCurrency(sum, currency),
      };
    });
}
