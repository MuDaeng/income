import { dailyPriceSchema } from './daily-price.schema.js';

describe('dailyPriceSchema', () => {
  it('securityId만 있거나 시작일 <= 종료일이면 통과하고 securityId 앞뒤 공백을 지운다', () => {
    expect(dailyPriceSchema.parse({ securityId: ' US0378331005 ' })).toEqual({ securityId: 'US0378331005' });
    expect(
      dailyPriceSchema.safeParse({ securityId: 'US0378331005', from: '2026-01-01', to: '2026-01-01' })
        .success,
    ).toBe(true);
  });

  it('securityId가 없거나 공백뿐이면 거절한다', () => {
    expect(dailyPriceSchema.safeParse({}).success).toBe(false);
    expect(dailyPriceSchema.safeParse({ securityId: '   ' }).success).toBe(false);
  });

  it('날짜 형식이 아니면 거절한다', () => {
    expect(dailyPriceSchema.safeParse({ securityId: 'US0378331005', to: '2026/01/01' }).success).toBe(
      false,
    );
  });

  it('시작일이 종료일보다 뒤면 from에 오류를 낸다', () => {
    const result = dailyPriceSchema.safeParse({
      securityId: 'US0378331005',
      from: '2026-02-01',
      to: '2026-01-01',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['from']);
  });
});
