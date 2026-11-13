import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { Repository } from 'typeorm';
import {
  Currency,
  Dividend,
  DividendType,
  Security,
  truncateByCurrency,
} from '@app/common';
import {
  KisClient,
  MassiveClient,
  toMassiveTicker,
  type KisDividendItem,
  type MassiveDividend,
} from '@app/core';
import { toYmd } from './iso-date.js';

type DividendRow = Pick<
  Dividend,
  'id' | 'paymentDate' | 'noticeDate' | 'amount' | 'type'
>;

/**
 * 종목 하나의 배당을 원천에서 받아 dividend에 upsert한다. 언제 부를지(하루 한 번)는 SecurityRefreshService가 정한다.
 * - KRW: KIS 예탁원 배당일정 (6자리 symbol, 기간은 기준일)
 * - USD: Massive Dividends (symbol을 Massive 티커로, 기간은 배당락일)
 */
@Injectable()
export class DividendService {
  constructor(
    @InjectRepository(Dividend)
    private readonly dividendRepository: Repository<Dividend>,
    private readonly kisClient: KisClient,
    private readonly massiveClient: MassiveClient,
  ) {}

  /** [from, to] 배당을 저장하고 { 받은 건수, 저장한 행 수 }를 돌려준다. KRW·USD 외 통화는 0 */
  async fetchAndSave(
    security: Security,
    from: string,
    to: string,
  ): Promise<{ fetched: number; saved: number }> {
    if (security.currency !== Currency.KRW && security.currency !== Currency.USD) {
      return { fetched: 0, saved: 0 };
    }
    const { fetched, rows } =
      security.currency === Currency.KRW
        ? await this.fetchKrwDividends(security, from, to)
        : await this.fetchUsdDividends(security, from, to);
    if (rows.length > 0) {
      await this.dividendRepository.upsert(rows, ['id', 'paymentDate']);
    }
    return { fetched, saved: rows.length };
  }

  /** KIS 배당일정. 기간은 기준일 */
  private async fetchKrwDividends(security: Security, from: string, to: string) {
    const items = await this.kisClient.getDividends(
      security.symbol,
      toYmd(from),
      toYmd(to),
    );
    return {
      fetched: items.length,
      rows: items.flatMap((item) => fromKisItem(security.id, item)),
    };
  }

  /** Massive 현금배당. 기간은 배당락일 */
  private async fetchUsdDividends(security: Security, from: string, to: string) {
    const dividends = await this.massiveClient.getDividends(
      toMassiveTicker(security.symbol),
      from,
      to,
    );
    return {
      fetched: dividends.length,
      rows: dividends.flatMap((dividend) => fromMassiveDividend(security.id, dividend)),
    };
  }
}

/**
 * KIS 배당일정 한 행 → dividend 행(현금·주식 각각). noticeDate는 기준일.
 * 지급일이 아직 정해지지 않은 행은 PK(id, paymentDate)를 만들 수 없어 건너뛴다 (다음 날 조회 때 채워짐).
 */
const fromKisItem = (id: string, item: KisDividendItem): DividendRow[] => {
  const rows: DividendRow[] = [];
  const noticeDate = toIsoDate(item.record_date);
  if (!noticeDate) {
    return rows;
  }
  const cash = toDecimal(item.per_sto_divi_amt);
  const cashPayDate = toIsoDate(item.divi_pay_dt);
  if (cashPayDate && cash.gt(0)) {
    rows.push({
      id,
      paymentDate: cashPayDate,
      noticeDate,
      amount: truncateByCurrency(cash, Currency.KRW),
      type: DividendType.MONEY,
    });
  }
  const stockRate = toDecimal(item.stk_divi_rate);
  const stockPayDate = toIsoDate(item.stk_div_pay_dt);
  if (stockPayDate && stockRate.gt(0)) {
    rows.push({
      id,
      paymentDate: stockPayDate,
      noticeDate,
      // 주식배당률(%), 소수 6자리 버림
      amount: stockRate.toDecimalPlaces(6, Decimal.ROUND_DOWN).toFixed(6),
      type: DividendType.STOCK,
    });
  }
  return rows;
};

/**
 * Massive 현금배당 한 건 → dividend 행. noticeDate는 KRW와 같게 기준일(record_date), 없으면 배당락일.
 * 지급일이 없거나 금액이 0 이하면 건너뛴다. 금액은 소수 6자리 버림.
 */
const fromMassiveDividend = (id: string, dividend: MassiveDividend): DividendRow[] => {
  const paymentDate = toIsoDate(dividend.pay_date);
  const noticeDate =
    toIsoDate(dividend.record_date) ?? toIsoDate(dividend.ex_dividend_date);
  const cash = new Decimal(Number.isFinite(dividend.cash_amount) ? dividend.cash_amount : 0);
  if (!paymentDate || !noticeDate || cash.lte(0)) {
    return [];
  }
  return [
    {
      id,
      paymentDate,
      noticeDate,
      amount: truncateByCurrency(cash, Currency.USD),
      type: DividendType.MONEY,
    },
  ];
};

/** 숫자가 아니거나 비었으면 0 (new Decimal('')는 예외) */
const toDecimal = (value: string | undefined) => {
  const trimmed = value?.trim() ?? '';
  return new Decimal(/^-?\d+(\.\d+)?$/.test(trimmed) ? trimmed : 0);
};

/**
 * 'YYYYMMDD'·'YYYY/MM/DD'·'YYYY-MM-DD' → 'YYYY-MM-DD', 비었거나 형식이 다르면 null.
 * KIS는 기준일(record_date)은 'YYYYMMDD', 지급일(divi_pay_dt)은 'YYYY/MM/DD', Massive는 'YYYY-MM-DD'로 준다
 */
const toIsoDate = (date: string | undefined) => {
  const value = (date ?? '').trim().replace(/[/-]/g, '');
  return /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : null;
};
