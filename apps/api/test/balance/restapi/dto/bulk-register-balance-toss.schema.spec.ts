import { bulkRegisterBalanceTossSchema } from '../../../../src/balance/restapi/dto/bulk-register-balance-toss.schema.js';

const buy = {
  transactionType: 'BUY',
  marketCountry: 'US',
  currency: 'USD',
  symbol: 'AAPL',
  assetClass: 'STOCK',
  isinCode: 'US0378331005',
  quantity: '3',
  filledPrice: '189.12',
  amount: '567.36',
  commission: '0.57',
  tax: '0',
  netAmount: '567.93',
  exchangeRate: '1386.00',
  settlementDate: '2026-09-18',
  settled: true,
  transactionTime: '2026-10-16T06:30:00+09:00',
  isCancellation: false,
};

const deposit = {
  ...buy,
  transactionType: 'DEPOSIT',
  marketCountry: 'KR',
  currency: 'KRW',
  symbol: null,
  assetClass: null,
  isinCode: null,
  quantity: null,
  filledPrice: null,
  exchangeRate: null,
  amount: '100000',
  netAmount: '100000',
  commission: '0',
};

const issuePaths = (transaction: object) =>
  bulkRegisterBalanceTossSchema
    .safeParse({ transactionList: [transaction] })
    .error?.issues.map((i) => i.path) ?? [];

describe('bulkRegisterBalanceTossSchema', () => {
  it('매수·입금(null 필드 포함) 거래는 통과한다', () => {
    expect(
      bulkRegisterBalanceTossSchema.safeParse({
        transactionList: [buy, deposit],
      }).success,
    ).toBe(true);
  });

  it('미결제 거래는 transactionTime null도 통과한다', () => {
    expect(
      issuePaths({ ...buy, settled: false, transactionTime: null, filledPrice: null }),
    ).toEqual([]);
  });

  it('빈 거래 목록은 오류', () => {
    expect(
      bulkRegisterBalanceTossSchema.safeParse({ transactionList: [] }).success,
    ).toBe(false);
  });

  it.each(['transactionType', 'commission', 'settlementDate', 'settled', 'isCancellation'])(
    '%s는 필수',
    (key) => {
      const rest: Record<string, unknown> = { ...buy };
      delete rest[key];
      expect(issuePaths(rest)).toEqual([['transactionList', 0, key]]);
    },
  );

  it.each([
    ['transactionType', 'SPLIT'],
    ['marketCountry', 'JP'],
    ['currency', 'EUR'],
    ['assetClass', 'FUND'],
  ])('%s에 목록 밖의 값 %s도 통과한다', (key, value) => {
    expect(issuePaths({ ...buy, [key]: value })).toEqual([]);
  });

  it.each(['transactionType', 'marketCountry', 'currency', 'assetClass'])(
    '%s가 빈 문자열이면 오류',
    (key) => {
      expect(issuePaths({ ...buy, [key]: '' })).toEqual([
        ['transactionList', 0, key],
      ]);
    },
  );

  it.each(['transactionType', 'marketCountry', 'currency'])(
    '%s는 null이면 오류',
    (key) => {
      expect(issuePaths({ ...buy, [key]: null })).toEqual([
        ['transactionList', 0, key],
      ]);
    },
  );

  it.each(['-1', 'abc', '1.'])('금액 %s는 오류', (amount) => {
    expect(issuePaths({ ...buy, amount })).toEqual([
      ['transactionList', 0, 'amount'],
    ]);
  });

  it('commission·tax는 null이면 오류', () => {
    expect(issuePaths({ ...buy, commission: null, tax: null })).toEqual([
      ['transactionList', 0, 'commission'],
      ['transactionList', 0, 'tax'],
    ]);
  });

  it('날짜·일시 형식이 틀리면 오류', () => {
    expect(
      issuePaths({
        ...buy,
        settlementDate: '2026/09/18',
        transactionTime: '2026-10-16 06:30',
      }),
    ).toEqual([
      ['transactionList', 0, 'settlementDate'],
      ['transactionList', 0, 'transactionTime'],
    ]);
  });
});
