import { monthlyBalanceSchema } from '../../src/balance/monthly-balance.schema.js';

describe('monthlyBalanceSchema', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-11-14T03:00:00Z'), toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['같은 달', { from: '2026-11', to: '2026-11' }],
    ['이번 달까지', { from: '2025-01', to: '2026-11' }],
    ['최대 120개월', { from: '2016-12', to: '2026-11' }],
    ['증권사 지정', { from: '2026-01', to: '2026-11', securityCompany: 'KIWOOM' }],
  ])('%s은 통과', (_, input) => {
    expect(monthlyBalanceSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    ['형식 오류', { from: '2026-1', to: '2026-11' }],
    ['13월', { from: '2026-13', to: '2026-11' }],
    ['날짜 형식', { from: '2026-01-01', to: '2026-11' }],
    ['누락', { from: '2026-01' }],
    ['from > to', { from: '2026-10', to: '2026-09' }],
    ['미래 달', { from: '2026-11', to: '2026-12' }],
    ['120개월 초과', { from: '2016-11', to: '2026-11' }],
    ['없는 증권사', { from: '2026-01', to: '2026-11', securityCompany: 'ROBINHOOD' }],
  ])('%s은 실패', (_, input) => {
    expect(monthlyBalanceSchema.safeParse(input).success).toBe(false);
  });
});
