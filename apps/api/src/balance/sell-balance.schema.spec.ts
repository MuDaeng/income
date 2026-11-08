import { sellBalanceSchema } from './sell-balance.schema.js';

const base = {
  securityId: '005930',
  purchaseDate: '2026-11-05',
  sequence: 1,
  amount: '3',
  saleDate: '2026-11-08',
};

const issuePaths = (value: object) =>
  sellBalanceSchema.safeParse(value).error?.issues.map((i) => i.path) ?? [];

describe('sellBalanceSchema', () => {
  it('올바른 입력은 통과한다', () => {
    expect(sellBalanceSchema.safeParse(base).success).toBe(true);
  });

  it('매도일이 매수일보다 이전이면 saleDate 오류', () => {
    expect(issuePaths({ ...base, saleDate: '2026-11-04' })).toEqual([
      ['saleDate'],
    ]);
  });

  it('saleDate는 필수', () => {
    const { saleDate: _, ...rest } = base;
    expect(issuePaths(rest)).toEqual([['saleDate']]);
  });

  it('sequence가 양의 정수가 아니면 오류', () => {
    expect(issuePaths({ ...base, sequence: 1.5 })).toEqual([['sequence']]);
    expect(issuePaths({ ...base, sequence: 0 })).toEqual([['sequence']]);
    expect(issuePaths({ ...base, sequence: '1' })).toEqual([['sequence']]);
  });

  it('수량이 0이거나 숫자 문자열이 아니면 오류', () => {
    expect(issuePaths({ ...base, amount: '0' })).toEqual([['amount']]);
    expect(issuePaths({ ...base, amount: 'abc' })).toEqual([['amount']]);
  });
});
