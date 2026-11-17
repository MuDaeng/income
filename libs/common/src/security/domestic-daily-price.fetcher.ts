import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Currency } from './currency.enum.js';
import { truncateByCurrency } from './currency-decimal.js';
import { DailySecurity } from './daily-security.entity.js';
import { Security } from './security.entity.js';
import type {
  ImportDailySecuritiesInput,
  ImportDailySecuritiesResult,
} from './us-daily-price.fetcher.js';
import { DataGoKrClient } from '../client/data-go-kr/data-go-kr.client.js';
import type {
  PriceItem,
  PricePage,
  PriceQuery,
} from '../client/data-go-kr/data-go-kr.types.js';

/** data.go.kr 한 페이지 최대 행 수 */
const PAGE_SIZE = 10_000;
const UPSERT_CHUNK = 1_000;
/** 기간을 생략했을 때 가져올 일수 */
const DEFAULT_DAYS = 4;

type DailySecurityRow = Pick<
  DailySecurity,
  | 'id'
  | 'date'
  | 'openingPrice'
  | 'closingPrice'
  | 'highestPrice'
  | 'lowestPrice'
>;

/** 국내 주식·ETF 일별 시세 가져오기 (batch domestic-daily-prices 잡, api의 일회용 전체 적재) */
@Injectable()
export class DomesticDailyPriceFetcher {
  private readonly logger = new Logger(DomesticDailyPriceFetcher.name);

  constructor(
    @InjectRepository(DailySecurity)
    private readonly dailySecurityRepository: Repository<DailySecurity>,
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    private readonly dataGoKrClient: DataGoKrClient,
  ) {}

  /**
   * data.go.kr 주식시세(국내 상장 주식)와 증권상품시세(ETF)를 받아 daily_security에 넣는다.
   * security에 있는 KRW 종목(ISIN)만 저장하고, 페이지(10,000행)마다 바로 upsert한다.
   * 긴 기간은 달마다 나눠 받는다(한 요청 범위가 크면 느려 timeout). 이미 있는 (종목, 날짜)는 갱신하므로 다시 실행해도 된다.
   * 생략하면 to = 오늘(한국 시간), from = to − 4일
   */
  async importFromDataGoKr(
    input: ImportDailySecuritiesInput,
  ): Promise<ImportDailySecuritiesResult> {
    const to = input.to ?? todayInSeoul();
    const from = input.from ?? addDays(to, -DEFAULT_DAYS);

    const krwSecurities = await this.securityRepository.find({
      select: { id: true },
      where: { currency: Currency.KRW },
    });
    const knownIds = new Set(krwSecurities.map(({ id }) => id));

    const result: ImportDailySecuritiesResult = {
      from,
      to,
      fetched: 0,
      saved: 0,
      skipped: 0,
      firstDate: null,
      lastDate: null,
    };
    for (const window of monthlyWindows(from, to)) {
      await this.importPages(window, '주식 일별 시세', knownIds, result, (query) =>
        this.dataGoKrClient.getStockPrices(query),
      );
      await this.importPages(window, 'ETF 일별 시세', knownIds, result, (query) =>
        this.dataGoKrClient.getEtfPrices(query),
      );
    }
    return result;
  }

  /** 한 구간을 10,000행씩 페이지를 넘기며 KRW 종목만 upsert하고 result에 더한다 */
  private async importPages(
    window: { from: string; to: string },
    label: string,
    knownIds: Set<string>,
    result: ImportDailySecuritiesResult,
    fetchPage: (query: PriceQuery) => Promise<PricePage>,
  ): Promise<void> {
    for (let pageNo = 1; ; pageNo++) {
      const page = await fetchPage({
        beginBasDt: toYmd(window.from),
        // endBasDt는 그 날짜를 포함하지 않으므로 다음 날을 넘김
        endBasDt: toYmd(addDays(window.to, 1)),
        pageNo,
        numOfRows: PAGE_SIZE,
      });

      const prices = page.items
        .filter((item) => knownIds.has(item.isinCd))
        .map(toDailySecurity);
      for (let i = 0; i < prices.length; i += UPSERT_CHUNK) {
        await this.dailySecurityRepository.upsert(
          prices.slice(i, i + UPSERT_CHUNK),
          ['id', 'date'],
        );
      }

      result.fetched += page.items.length;
      result.saved += prices.length;
      result.skipped += page.items.length - prices.length;
      for (const { date } of prices) {
        if (!result.firstDate || date < result.firstDate) result.firstDate = date;
        if (!result.lastDate || date > result.lastDate) result.lastDate = date;
      }
      this.logger.log(
        `${label} ${window.from}~${window.to} ${pageNo}페이지: ${page.items.length}/${page.totalCount}행, 누적 저장 ${result.saved}`,
      );

      if (page.items.length === 0 || pageNo * PAGE_SIZE >= page.totalCount) {
        return;
      }
    }
  }
}

/** data.go.kr 일별 시세 한 행 → daily_security 행 (원화 정수) */
export const toDailySecurity = (item: PriceItem): DailySecurityRow => ({
  id: item.isinCd,
  date: `${item.basDt.slice(0, 4)}-${item.basDt.slice(4, 6)}-${item.basDt.slice(6, 8)}`,
  openingPrice: toKrwPrice(item.mkp),
  closingPrice: toKrwPrice(item.clpr),
  highestPrice: toKrwPrice(item.hipr),
  lowestPrice: toKrwPrice(item.lopr),
});

/** 원화 정수로 버림. 빈 값이 오면 new Decimal('')가 예외라 0으로 둠 (거래정지 종목은 원천에서도 0) */
const toKrwPrice = (value: string) =>
  truncateByCurrency(value?.trim() || '0', Currency.KRW);

/** [from, to]를 달력 달 단위 구간들로 나눈다 (둘 다 포함) */
export const monthlyWindows = (
  from: string,
  to: string,
): { from: string; to: string }[] => {
  const windows: { from: string; to: string }[] = [];
  for (let start = from; start <= to; ) {
    const monthEnd = addDays(nextMonthFirst(start), -1);
    const end = monthEnd < to ? monthEnd : to;
    windows.push({ from: start, to: end });
    start = addDays(end, 1);
  }
  return windows;
};

const parseIsoDate = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);
const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (isoDate: string, days: number) => {
  const date = parseIsoDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
};

const nextMonthFirst = (isoDate: string) => {
  const date = parseIsoDate(isoDate);
  return toIsoDate(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)),
  );
};

/** 'YYYY-MM-DD' → 'YYYYMMDD' */
const toYmd = (isoDate: string) => isoDate.replaceAll('-', '');

const todayInSeoul = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(
    new Date(),
  );
