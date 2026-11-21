import { type Account, AccountType, SecurityCompany } from '@app/common';
import { AccountReader } from '../../src/user/account.reader.js';
import { AccountWriter } from '../../src/user/account.writer.js';

type AccountRow = Pick<Account, 'userId' | 'id' | 'securityCompany' | 'accountType'>;

/** 테스트용 기본 계좌 (id 1, 키움 일반 계좌) */
export const ACCOUNT = {
  userId: 1,
  id: 1,
  securityCompany: SecurityCompany.KIWOOM,
  accountType: AccountType.NORMAL,
} satisfies AccountRow as AccountRow;

/**
 * BalanceService 테스트용 계좌 Reader/Writer. vi.resetAllMocks에 지워지지 않도록 일반 함수로 둔다.
 * resolve는 accountId가 있으면 그 id, 없으면 1번 계좌를 입력 증권사로 돌려준다.
 */
export function accountProviders(accounts: AccountRow[] = [ACCOUNT]) {
  return [
    {
      provide: AccountReader,
      useValue: {
        findByUser: (_userId: number) => Promise.resolve(accounts),
        getOwned: (_userId: number, id: number) =>
          Promise.resolve({ ...ACCOUNT, id }),
      },
    },
    {
      provide: AccountWriter,
      useValue: {
        resolve: (
          _userId: number,
          securityCompany: SecurityCompany,
          accountId?: number,
        ) =>
          Promise.resolve({ ...ACCOUNT, id: accountId ?? 1, securityCompany }),
      },
    },
  ];
}
