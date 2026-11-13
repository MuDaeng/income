import { dividendHistorySchema } from '../../src/balance/dividend-history.schema.js';

describe('dividendHistorySchema', () => {
  it('생략하거나 시작일 <= 종료일이면 통과한다', () => {
    expect(dividendHistorySchema.safeParse({}).success).toBe(true);
    expect(dividendHistorySchema.safeParse({ to: '2026-12-31' }).success).toBe(true);
    expect(
      dividendHistorySchema.safeParse({ from: '2026-01-01', to: '2026-01-01' }).success,
    ).toBe(true);
  });

  it('날짜 형식이 아니면 거절한다', () => {
    expect(dividendHistorySchema.safeParse({ from: '20260101' }).success).toBe(false);
  });

  it('시작일이 종료일보다 뒤면 from에 오류를 낸다', () => {
    const result = dividendHistorySchema.safeParse({
      from: '2026-02-01',
      to: '2026-01-01',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['from']);
  });
});
