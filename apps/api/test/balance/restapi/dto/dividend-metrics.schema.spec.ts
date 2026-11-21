import { dividendMetricsSchema } from '../../../../src/balance/restapi/dto/dividend-metrics.schema.js';

describe('dividendMetricsSchema', () => {
  it.each([
    ['생략 (전체 증권사)', {}],
    ['계좌 id', { accountId: '2' }],
  ])('%s이면 통과한다', (_, input) => {
    expect(dividendMetricsSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    ['0', { accountId: '0' }],
    ['빈 문자열', { accountId: 'abc' }],
  ])('%s이면 accountId 오류', (_, input) => {
    const result = dividendMetricsSchema.safeParse(input);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ['accountId'],
    ]);
  });
});
