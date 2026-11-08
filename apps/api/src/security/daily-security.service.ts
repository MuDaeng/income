import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Currency,
  DailySecurity,
  Security,
  truncateByCurrency,
} from '@app/common';
import { DataGoKrClient } from '../clients/data-go-kr/data-go-kr.client.js';
import type { StockPriceItem } from '../clients/data-go-kr/data-go-kr.types.js';
import type { ImportDailySecuritiesRequest } from './import-daily-securities.schema.js';

/** 기간을 생략했을 때 가져올 햇수 (환율 가져오기와 같은 기간) */
const DEFAULT_YEARS = 2;
/** data.go.kr 한 페이지 최대 행 수 */
const PAGE_SIZE = 10_000;
const UPSERT_CHUNK = 1_000;

export interface ImportDailySecuritiesResult {
  from: string;
  to: string;
  /** data.go.kr에서 받은 행 수 */
  fetched: number;
  /** daily_security에 저장한 행 수 */
  saved: number;
  /** security에 없는 ISIN이라 건너뛴 행 수 */
  skipped: number;
  firstDate: string | null;
  lastDate: string | null;
}

@Injectable()
export class DailySecurityService {
  private readonly logger = new Logger(DailySecurityService.name);

  constructor(
    @InjectRepository(DailySecurity)
    private readonly dailySecurityRepository: Repository<DailySecurity>,
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    private readonly dataGoKrClient: DataGoKrClient,
  ) {}

  /**
   * data.go.kr 주식시세(국내 상장 주식)를 받아 daily_security에 넣는다.
   * security에 있는 KRW 종목(ISIN)만 저장하고, 페이지(10,000행)마다 바로 upsert한다.
   * 이미 있는 (종목, 날짜)는 갱신하므로 다시 실행해도 된다.
   */
  async importFromDataGoKr(
    input: ImportDailySecuritiesRequest,
  ): Promise<ImportDailySecuritiesResult> {
    const to = input.to ?? toIsoDate(new Date());
    const from = input.from ?? yearsBefore(to, DEFAULT_YEARS);

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
    for (let pageNo = 1; ; pageNo++) {
      const page = await this.dataGoKrClient.getStockPrices({
        beginBasDt: toBasDt(from),
        // endBasDt는 그 날짜를 포함하지 않으므로 다음 날을 넘김
        endBasDt: toBasDt(addDays(to, 1)),
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
        `일별 시세 ${pageNo}페이지: 누적 ${result.fetched}/${page.totalCount}행, 저장 ${result.saved}`,
      );

      if (page.items.length === 0 || pageNo * PAGE_SIZE >= page.totalCount) {
        return result;
      }
    }
  }
}

type DailySecurityRow = Pick<
  DailySecurity,
  'id' | 'date' | 'openingPrice' | 'closingPrice' | 'highestPrice' | 'lowestPrice'
>;

const toDailySecurity = (item: StockPriceItem): DailySecurityRow => ({
  id: item.isinCd,
  date: `${item.basDt.slice(0, 4)}-${item.basDt.slice(4, 6)}-${item.basDt.slice(6, 8)}`,
  openingPrice: toPrice(item.mkp),
  closingPrice: toPrice(item.clpr),
  highestPrice: toPrice(item.hipr),
  lowestPrice: toPrice(item.lopr),
});

/** 원화 정수로 버림. 빈 값이 오면 new Decimal('')가 예외라 0으로 둠 (거래정지 종목은 원천에서도 0) */
const toPrice = (value: string) =>
  truncateByCurrency(value?.trim() || '0', Currency.KRW);

/** UTC 기준 'YYYY-MM-DD' */
const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const parseIsoDate = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);

const yearsBefore = (isoDate: string, years: number) => {
  const date = parseIsoDate(isoDate);
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return toIsoDate(date);
};

const addDays = (isoDate: string, days: number) => {
  const date = parseIsoDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
};

/** 'YYYY-MM-DD' → 'YYYYMMDD' */
const toBasDt = (isoDate: string) => isoDate.replaceAll('-', '');
