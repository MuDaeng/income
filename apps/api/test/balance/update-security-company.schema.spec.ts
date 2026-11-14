import { updateSecurityCompanySchema } from '../../src/balance/update-security-company.schema.js';

const base = {
  securityId: 'KR7005930003',
  purchaseDate: '2026-11-05',
  sequence: 1,
  securityCompany: 'KIWOOM',
};

describe('updateSecurityCompanySchema', () => {
  it('정상 입력은 통과한다', () => {
    expect(updateSecurityCompanySchema.safeParse(base).success).toBe(true);
  });

  it.each([
    ['증권사 누락', { securityCompany: undefined }, 'securityCompany'],
    ['목록에 없는 증권사', { securityCompany: 'ROBINHOOD' }, 'securityCompany'],
    ['sequence 0', { sequence: 0 }, 'sequence'],
    ['sequence 소수', { sequence: 1.5 }, 'sequence'],
    ['날짜 형식 오류', { purchaseDate: '20261105' }, 'purchaseDate'],
    ['securityId 공백', { securityId: ' ' }, 'securityId'],
  ])('%s이면 실패한다', (_, patch, field) => {
    const result = updateSecurityCompanySchema.safeParse({ ...base, ...patch });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([[field]]);
  });
});
