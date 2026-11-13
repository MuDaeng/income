import { deletePurchaseSchema } from '../../src/balance/delete-purchase.schema.js';

/** 쿼리 문자열 그대로 (sequence도 문자열) */
const base = { securityId: '005930', purchaseDate: '2026-11-05', sequence: '2' };

const issuePaths = (value: object) =>
  deletePurchaseSchema.safeParse(value).error?.issues.map((i) => i.path) ?? [];

describe('deletePurchaseSchema', () => {
  it('쿼리 문자열 sequence를 숫자로 바꾼다', () => {
    expect(deletePurchaseSchema.parse(base)).toEqual({
      securityId: '005930',
      purchaseDate: '2026-11-05',
      sequence: 2,
    });
  });

  it.each(['0', '-1', '1.5', 'abc', ''])(
    'sequence가 양의 정수가 아니면 오류 (%s)',
    (sequence) => {
      expect(issuePaths({ ...base, sequence })).toEqual([['sequence']]);
    },
  );

  it('purchaseDate가 날짜 형식이 아니면 오류', () => {
    expect(issuePaths({ ...base, purchaseDate: '2026/11/05' })).toEqual([
      ['purchaseDate'],
    ]);
  });

  it('세 값 모두 필수', () => {
    expect(issuePaths({})).toEqual([
      ['securityId'],
      ['purchaseDate'],
      ['sequence'],
    ]);
  });
});
