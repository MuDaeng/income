import { periodReturnSchema } from './period-return.schema.js';

describe('periodReturnSchema', () => {
  it('시작일 <= 종료일이면 통과한다', () => {
    expect(
      periodReturnSchema.safeParse({ from: '2026-01-01', to: '2026-01-01' }).success,
    ).toBe(true);
  });

  it('시작일·종료일이 없거나 형식이 틀리면 거절한다', () => {
    expect(periodReturnSchema.safeParse({}).success).toBe(false);
    expect(periodReturnSchema.safeParse({ from: '2026-01-01' }).success).toBe(false);
    expect(
      periodReturnSchema.safeParse({ from: '20260101', to: '2026-01-31' }).success,
    ).toBe(false);
  });

  it('시작일이 종료일보다 뒤면 from에 오류를 낸다', () => {
    const result = periodReturnSchema.safeParse({ from: '2026-02-01', to: '2026-01-01' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['from']);
  });
});
