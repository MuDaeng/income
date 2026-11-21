import {
  offsetTossLending,
  type TossTransfer,
} from '../../src/balance/toss-lending.js';

const ISIN = 'KR7005930003';
const OTHER = 'US0378331005';

const out = (
  quantity: string,
  settlementDate: string,
  isinCode = ISIN,
  transactionTime: string | null = null,
): TossTransfer => ({
  direction: 'OUT',
  isinCode,
  settlementDate,
  transactionTime,
  quantity,
});
const inn = (
  quantity: string,
  settlementDate: string,
  isinCode = ISIN,
): TossTransfer => ({
  direction: 'IN',
  isinCode,
  settlementDate,
  transactionTime: null,
  quantity,
});

describe('offsetTossLending', () => {
  it('출고 뒤 같은 수량의 입고는 반환으로 상쇄한다 (입력 순서와 무관)', () => {
    const lent = out('10', '2026-10-01');
    const returned = inn('10', '2026-10-20');

    const result = offsetTossLending([returned, lent], []);

    expect(result.returned).toEqual([returned]);
    expect(result.repaid).toEqual([lent]);
    expect(result.transfersIn).toEqual([]);
    expect(result.transfersOut).toEqual([]);
    expect(result.lent).toEqual([]);
  });

  it('부분 반환은 출고의 남은 수량을 줄이고, 다 돌아오면 상쇄된다', () => {
    const lent = out('10', '2026-10-01');

    const partial = offsetTossLending([lent, inn('4', '2026-10-10')], []);
    expect(partial.lent).toEqual([
      {
        transfer: lent,
        key: { isinCode: ISIN, settlementDate: '2026-10-01', quantity: '10', index: 0 },
        quantity: '6',
      },
    ]);

    const full = offsetTossLending(
      [lent, inn('4', '2026-10-10'), inn('6', '2026-10-15')],
      [],
    );
    expect(full.lent).toEqual([]);
    expect(full.repaid).toEqual([lent]);
    expect(full.returned).toHaveLength(2);
  });

  it('입고가 여러 출고에 걸치면 오래된 출고부터 채우고, 남는 수량만 매수로 돌려준다', () => {
    const first = out('3', '2026-10-01');
    const second = out('2', '2026-10-02');
    const big = inn('7', '2026-10-20');

    const result = offsetTossLending([first, second, big], []);

    expect(result.repaid).toEqual([first, second]);
    expect(result.transfersIn).toEqual([{ transfer: big, quantity: '2' }]);
  });

  it('출고보다 먼저 들어온 입고와 다른 종목의 입고는 상쇄하지 않는다', () => {
    const early = inn('5', '2026-09-01');
    const other = inn('5', '2026-10-20', OTHER);

    const result = offsetTossLending(
      [early, out('5', '2026-10-01'), other],
      [],
    );

    expect(result.transfersIn).toEqual([
      { transfer: early, quantity: '5' },
      { transfer: other, quantity: '5' },
    ]);
    expect(result.lent).toHaveLength(1);
  });

  it('실제 출고로 지정한 출고는 매도로 돌려주고 반환 대상에서 빠진다', () => {
    const real = out('10', '2026-10-01');

    const result = offsetTossLending(
      [real, inn('10', '2026-10-20')],
      [{ isinCode: ISIN, settlementDate: '2026-10-01', quantity: '10.000000', index: 0 }],
    );

    expect(result.transfersOut).toEqual([real]);
    expect(result.transfersIn).toHaveLength(1);
    expect(result.lent).toEqual([]);
  });

  it('같은 ISIN·결제일·수량의 출고는 처리일시 순으로 index를 매겨 구분한다', () => {
    const late = out('1', '2026-10-01', ISIN, '2026-10-01T15:00:00+09:00');
    const early = out('1', '2026-10-01', ISIN, '2026-10-01T09:00:00+09:00');

    const result = offsetTossLending(
      [late, early],
      [{ isinCode: ISIN, settlementDate: '2026-10-01', quantity: '1', index: 1 }],
    );

    expect(result.transfersOut).toEqual([late]);
    expect(result.lent.map(({ transfer, key }) => [transfer, key.index])).toEqual([
      [early, 0],
    ]);
  });
});
