import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { Repository } from 'typeorm';
import {
  Currency,
  Dividend,
  DividendType,
  Security,
  SecuritySearch,
  truncateByCurrency,
} from '@app/common';
import { KisClient } from '../clients/kis/kis.client.js';
import type { KisDividendItem } from '../clients/kis/kis.types.js';

/** 지난 배당은 이만큼 거슬러 받는다 */
const PAST_YEARS = 2;
/** 공시된 앞으로의 배당까지 받으려고 오늘 이후로도 조회 */
const FUTURE_YEARS = 1;

type DividendRow = Pick<
  Dividend,
  'id' | 'paymentDate' | 'noticeDate' | 'amount' | 'type'
>;

/** 종목 배당 정보 갱신. 잔고 등록·종목 조회 등에서 쓴다 */
@Injectable()
export class DividendService {
  private readonly logger = new Logger(DividendService.name);

  constructor(
    @InjectRepository(Dividend)
    private readonly dividendRepository: Repository<Dividend>,
    @InjectRepository(SecuritySearch)
    private readonly securitySearchRepository: Repository<SecuritySearch>,
    private readonly kisClient: KisClient,
  ) {}

  /**
   * 종목의 배당 정보를 KIS 배당일정으로 갱신한다. 하루에 한 번만 조회한다.
   * - security_search.lastSearchDate가 오늘(한국 시간)이면 아무것도 하지 않음
   * - 행이 없거나 오늘이 아니면 KIS 조회 → dividend upsert → lastSearchDate = 오늘
   * KIS는 국내 종목만 다루므로 KRW 종목만 처리한다.
   */
  async refreshDividends(security: Security): Promise<void> {
    if (security.currency !== Currency.KRW) {
      return;
    }
    const today = todayInSeoul();
    const search = await this.securitySearchRepository.findOneBy({
      id: security.id,
    });
    if (search?.lastSearchDate === today) {
      return;
    }

    const items = await this.kisClient.getDividends(
      security.symbol,
      toYmd(shiftYears(today, -PAST_YEARS)),
      toYmd(shiftYears(today, FUTURE_YEARS)),
    );
    const rows = items.flatMap((item) => toDividendRows(security.id, item));
    if (rows.length > 0) {
      await this.dividendRepository.upsert(rows, ['id', 'paymentDate']);
    }
    await this.securitySearchRepository.upsert(
      { id: security.id, lastSearchDate: today },
      ['id'],
    );
    this.logger.log(
      `배당 갱신 ${security.symbol}: ${items.length}건 중 ${rows.length}건 저장`,
    );
  }
}

/**
 * KIS 배당일정 한 행 → dividend 행(현금·주식 각각).
 * 지급일이 아직 정해지지 않은 행은 PK(id, paymentDate)를 만들 수 없어 건너뛴다 (다음 날 조회 때 채워짐).
 */
const toDividendRows = (id: string, item: KisDividendItem): DividendRow[] => {
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

/** 숫자가 아니거나 비었으면 0 (new Decimal('')는 예외) */
const toDecimal = (value: string | undefined) => {
  const trimmed = value?.trim() ?? '';
  return new Decimal(/^-?\d+(\.\d+)?$/.test(trimmed) ? trimmed : 0);
};

/**
 * 'YYYYMMDD' 또는 'YYYY/MM/DD' → 'YYYY-MM-DD', 비었거나 형식이 다르면 null.
 * KIS는 기준일(record_date)은 'YYYYMMDD', 지급일(divi_pay_dt)은 'YYYY/MM/DD'로 준다
 */
const toIsoDate = (date: string | undefined) => {
  const value = (date ?? '').trim().replace(/[/-]/g, '');
  return /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : null;
};

/** 'YYYY-MM-DD' → 'YYYYMMDD' */
const toYmd = (isoDate: string) => isoDate.replaceAll('-', '');

/** 한국 시간 기준 오늘 'YYYY-MM-DD' */
const todayInSeoul = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());

const shiftYears = (isoDate: string, years: number) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
};
