import { bulkSellBalanceSchema } from '../../../../src/balance/restapi/dto/bulk-sell-balance.schema.js';

const base = {
  securityId: '005930',
  securityCompany: 'KIWOOM',
  amount: '3',
  saleDate: '2026-11-08',
};

const issuePaths = (value: object) =>
  bulkSellBalanceSchema.safeParse(value).error?.issues.map((i) => i.path) ??
  [];

describe('bulkSellBalanceSchema', () => {
  it('올바른 입력은 통과한다', () => {
    expect(bulkSellBalanceSchema.safeParse(base).success).toBe(true);
  });

  it.each(['securityId', 'securityCompany', 'amount', 'saleDate'])(
    '%s는 필수',
    (key) => {
      const rest: Record<string, string> = { ...base };
      delete rest[key];
      expect(issuePaths(rest)).toEqual([[key]]);
    },
  );

  it('없는 증권사면 오류', () => {
    expect(issuePaths({ ...base, securityCompany: 'NOPE' })).toEqual([
      ['securityCompany'],
    ]);
  });

  it.each(['0', '-1', 'abc'])('수량 %s는 오류', (amount) => {
    expect(issuePaths({ ...base, amount })).toEqual([['amount']]);
  });

  it('매도일 형식이 틀리면 오류', () => {
    expect(issuePaths({ ...base, saleDate: '2026/11/08' })).toEqual([
      ['saleDate'],
    ]);
  });
});
