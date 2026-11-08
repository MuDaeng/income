import { importDailySecuritiesSchema } from './import-daily-securities.schema.js';

describe('importDailySecuritiesSchema', () => {
  it('생략하거나 시작일 <= 종료일이면 통과한다', () => {
    expect(importDailySecuritiesSchema.safeParse({}).success).toBe(true);
    expect(
      importDailySecuritiesSchema.safeParse({ from: '2026-11-05', to: '2026-11-05' }).success,
    ).toBe(true);
  });

  it('날짜 형식이 아니면 거절한다', () => {
    expect(importDailySecuritiesSchema.safeParse({ from: '20261105' }).success).toBe(false);
  });

  it('시작일이 종료일보다 뒤면 from에 오류를 낸다', () => {
    const result = importDailySecuritiesSchema.safeParse({
      from: '2026-11-06',
      to: '2026-11-05',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['from']);
  });
});
