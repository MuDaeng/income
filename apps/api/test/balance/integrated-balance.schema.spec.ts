import { integratedBalanceSchema } from '../../src/balance/integrated-balance.schema.js';

describe('integratedBalanceSchema', () => {
  it.each([
    ['생략 (전체 증권사)', {}],
    ['국내 증권사 값', { securityCompany: 'KIWOOM' }],
    ['기타', { securityCompany: 'ETC' }],
  ])('%s이면 통과한다', (_, input) => {
    expect(integratedBalanceSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    ['목록에 없는 값', { securityCompany: 'ROBINHOOD' }],
    ['빈 문자열', { securityCompany: '' }],
  ])('%s이면 securityCompany 오류', (_, input) => {
    const result = integratedBalanceSchema.safeParse(input);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ['securityCompany'],
    ]);
  });
});
