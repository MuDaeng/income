import { dividendMetricsSchema } from '../../../../src/balance/restapi/dto/dividend-metrics.schema.js';

describe('dividendMetricsSchema', () => {
  it.each([
    ['생략 (전체 증권사)', {}],
    ['증권사 값', { securityCompany: 'TOSS' }],
  ])('%s이면 통과한다', (_, input) => {
    expect(dividendMetricsSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    ['목록에 없는 값', { securityCompany: 'ROBINHOOD' }],
    ['빈 문자열', { securityCompany: '' }],
  ])('%s이면 securityCompany 오류', (_, input) => {
    const result = dividendMetricsSchema.safeParse(input);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ['securityCompany'],
    ]);
  });
});
