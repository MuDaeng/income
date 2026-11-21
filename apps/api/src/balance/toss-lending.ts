import { Decimal } from 'decimal.js';

/**
 * Toss 출고 한 건을 가리키는 키. 거래내역에 거래 id가 없어서 (ISIN, 결제일, 수량)과
 * 같은 키 안에서의 순번(index, 0부터, 결제일·처리일시 순)으로 구분한다.
 */
export type TossTransferKey = {
  isinCode: string;
  settlementDate: string;
  quantity: string;
  index: number;
};

/** 빌려주기 상쇄에 필요한 입출고 정보 */
export type TossTransfer = {
  direction: 'IN' | 'OUT';
  isinCode: string;
  settlementDate: string;
  /** 같은 결제일 안의 순서용 (null은 뒤로) */
  transactionTime: string | null;
  quantity: string;
};

export type LendingOffset<T extends TossTransfer> = {
  /** 매수로 등록할 입고와 그 수량 (빌려주기 반환으로 상쇄하고 남은 수량) */
  transfersIn: { transfer: T; quantity: string }[];
  /** 매도로 처리할 출고 (사용자가 실제 출고로 지정한 것) */
  transfersOut: T[];
  /** 빌려주기 반환으로 전량 상쇄되어 무시한 입고 */
  returned: T[];
  /** 반환되어 전량 상쇄된 빌려주기 출고 */
  repaid: T[];
  /** 아직 반환되지 않은 빌려주기 출고 (대여 중으로 보고 무시). quantity는 남은 대여 수량 */
  lent: { transfer: T; key: TossTransferKey; quantity: string }[];
};

/**
 * Toss 빌려주기 출고·반환 상쇄. 거래내역에는 빌려주기를 구분하는 필드가 없어서:
 * - 출고는 기본으로 빌려주기(대여 중)로 보고 매도하지 않는다. confirmedOut에 있는 출고만 실제 출고로 매도한다.
 * - 입고는 같은 종목의 앞선 빌려주기 출고 중 아직 반환되지 않은 수량에서 먼저 뺀다(오래된 출고부터, 부분 반환 포함).
 *   뺀 만큼은 반환이라 무시하고, 남은 수량만 매수(입고)로 등록한다.
 * 종목별로 결제일 → 처리일시 순으로 처리한다.
 */
export function offsetTossLending<T extends TossTransfer>(
  transfers: readonly T[],
  confirmedOut: readonly TossTransferKey[],
): LendingOffset<T> {
  const sorted = [...transfers].sort(byTime);
  const keys = transferKeys(sorted);
  const confirmed = new Set(confirmedOut.map(keyString));

  const result: LendingOffset<T> = {
    transfersIn: [],
    transfersOut: [],
    returned: [],
    repaid: [],
    lent: [],
  };
  // 종목별 반환 대기 중인 빌려주기 출고 (오래된 순)
  const pending = new Map<
    string,
    { transfer: T; key: TossTransferKey; remaining: Decimal }[]
  >();

  for (const transfer of sorted) {
    if (transfer.direction === 'OUT') {
      const key = keys.get(transfer)!;
      if (confirmed.has(keyString(key))) {
        result.transfersOut.push(transfer);
        continue;
      }
      const list = pending.get(transfer.isinCode) ?? [];
      list.push({ transfer, key, remaining: new Decimal(transfer.quantity) });
      pending.set(transfer.isinCode, list);
      continue;
    }

    let remaining = new Decimal(transfer.quantity);
    const list = pending.get(transfer.isinCode) ?? [];
    while (remaining.gt(0) && list.length > 0) {
      const lent = list[0];
      const portion = Decimal.min(remaining, lent.remaining);
      remaining = remaining.minus(portion);
      lent.remaining = lent.remaining.minus(portion);
      if (lent.remaining.lte(0)) {
        list.shift();
        result.repaid.push(lent.transfer);
      }
    }
    if (remaining.gt(0)) {
      result.transfersIn.push({ transfer, quantity: remaining.toString() });
    } else {
      result.returned.push(transfer);
    }
  }

  for (const list of pending.values()) {
    for (const { transfer, key, remaining } of list) {
      result.lent.push({ transfer, key, quantity: remaining.toString() });
    }
  }
  result.lent.sort((a, b) => byTime(a.transfer, b.transfer));
  return result;
}

/** 출고마다 키를 매긴다 (같은 ISIN·결제일·수량 안에서 정렬 순서대로 index 0, 1, …) */
function transferKeys<T extends TossTransfer>(
  sorted: readonly T[],
): Map<T, TossTransferKey> {
  const counts = new Map<string, number>();
  const keys = new Map<T, TossTransferKey>();
  for (const transfer of sorted) {
    if (transfer.direction !== 'OUT') {
      continue;
    }
    const { isinCode, settlementDate } = transfer;
    // '10'과 '10.000000'이 같은 키가 되도록 수량을 정규화
    const quantity = new Decimal(transfer.quantity).toString();
    const base = keyString({ isinCode, settlementDate, quantity, index: 0 });
    const index = counts.get(base) ?? 0;
    counts.set(base, index + 1);
    keys.set(transfer, { isinCode, settlementDate, quantity, index });
  }
  return keys;
}

function keyString({
  isinCode,
  settlementDate,
  quantity,
  index,
}: TossTransferKey): string {
  return [isinCode, settlementDate, new Decimal(quantity).toString(), index].join(
    '|',
  );
}

function byTime(a: TossTransfer, b: TossTransfer): number {
  return (
    a.settlementDate.localeCompare(b.settlementDate) ||
    (a.transactionTime ?? '￿').localeCompare(b.transactionTime ?? '￿')
  );
}
