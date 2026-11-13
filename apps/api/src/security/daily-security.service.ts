import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  type FindOperator,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import {
  Currency,
  DailySecurity,
  Security,
  truncateByCurrency,
} from '@app/common';
import {
  DataGoKrClient,
  type ImportDailySecuritiesResult,
  type PricePage,
  type PriceQuery,
} from '@app/core';
import type { DailyPriceResponse } from './daily-price.dto.js';
import { toDailySecurity } from './daily-price.fetcher.js';
import type { DailyPriceRequest } from './daily-price.schema.js';
import type { ImportDailySecuritiesRequest } from './import-daily-securities.schema.js';
import {
  addDays,
  addYears,
  formatIsoDate,
  toYmd,
} from './iso-date.js';
import { SecurityRefreshService } from './security-refresh.service.js';

/** 날짜 기간 조건. 둘 다 없으면 null(조건 없음) */
const dateFilter = (
  from: string | null,
  to: string | null,
): FindOperator<string> | null => {
  if (from && to) {
    return Between(from, to);
  }
  if (from) {
    return MoreThanOrEqual(from);
  }
  if (to) {
    return LessThanOrEqual(to);
  }
  return null;
};

/** 기간을 생략했을 때 가져올 햇수 (환율 가져오기와 같은 기간) */
const DEFAULT_YEARS = 2;
/** data.go.kr 한 페이지 최대 행 수 */
const PAGE_SIZE = 10_000;
const UPSERT_CHUNK = 1_000;

@Injectable()
export class DailySecurityService {
  private readonly logger = new Logger(DailySecurityService.name);

  constructor(
    @InjectRepository(DailySecurity)
    private readonly dailySecurityRepository: Repository<DailySecurity>,
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    private readonly dataGoKrClient: DataGoKrClient,
    private readonly securityRefreshService: SecurityRefreshService,
  ) {}

  /**
   * 종목 일별 시세 조회. id(ISIN)가 securityId와 같은 종목의 시세를 날짜 오름차순으로 돌려준다.
   * 종목이 없으면 404. 기간은 생략 가능. ISIN은 GET /securities(종목 검색)로 찾는다.
   * 읽기 전에 그 종목의 시세·배당을 원천에서 갱신한다(종목별 하루 한 번, 실패해도 저장분으로 응답).
   */
  async getDailyPrices(input: DailyPriceRequest): Promise<DailyPriceResponse> {
    const from = input.from ?? null;
    const to = input.to ?? null;

    const found = await this.securityRepository.findOneBy({
      id: input.securityId,
    });
    if (!found) {
      throw new NotFoundException('종목을 찾을 수 없습니다.');
    }
    await this.securityRefreshService.refresh(found);
    const { id, symbol, name, currency } = found;
    const security = { id, symbol, name, currency };

    const date = dateFilter(from, to);
    const rows = await this.dailySecurityRepository.find({
      where: { id: security.id, ...(date ? { date } : {}) },
      order: { date: 'ASC' },
    });
    const price = (value: string) =>
      truncateByCurrency(value, security.currency);
    return {
      security,
      from,
      to,
      prices: rows.map((row) => ({
        date: row.date,
        openingPrice: price(row.openingPrice),
        closingPrice: price(row.closingPrice),
        highestPrice: price(row.highestPrice),
        lowestPrice: price(row.lowestPrice),
      })),
    };
  }

  /**
   * data.go.kr 주식시세(국내 상장 주식)를 받아 daily_security에 넣는다.
   * security에 있는 KRW 종목(ISIN)만 저장하고, 페이지(10,000행)마다 바로 upsert한다.
   * 이미 있는 (종목, 날짜)는 갱신하므로 다시 실행해도 된다.
   */
  importFromDataGoKr(
    input: ImportDailySecuritiesRequest,
  ): Promise<ImportDailySecuritiesResult> {
    return this.importDataGoKrPages(input, '일별 시세', (query) =>
      this.dataGoKrClient.getStockPrices(query),
    );
  }

  /**
   * data.go.kr 증권상품시세(ETF)를 받아 daily_security에 넣는다. 주식시세와 같은 방식
   * (security의 KRW 종목만, 페이지마다 upsert, 다시 실행해도 됨).
   */
  importEtfFromDataGoKr(
    input: ImportDailySecuritiesRequest,
  ): Promise<ImportDailySecuritiesResult> {
    return this.importDataGoKrPages(input, 'ETF 일별 시세', (query) =>
      this.dataGoKrClient.getEtfPrices(query),
    );
  }

  /** data.go.kr 일별 시세 API(주식·ETF) 공통: 10,000행씩 페이지를 넘기며 KRW 종목만 upsert */
  private async importDataGoKrPages(
    input: ImportDailySecuritiesRequest,
    label: string,
    fetchPage: (query: PriceQuery) => Promise<PricePage>,
  ): Promise<ImportDailySecuritiesResult> {
    const to = input.to ?? formatIsoDate(new Date());
    const from = input.from ?? addYears(to, -DEFAULT_YEARS);

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
      const page = await fetchPage({
        beginBasDt: toYmd(from),
        // endBasDt는 그 날짜를 포함하지 않으므로 다음 날을 넘김
        endBasDt: toYmd(addDays(to, 1)),
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
        `${label} ${pageNo}페이지: 누적 ${result.fetched}/${page.totalCount}행, 저장 ${result.saved}`,
      );

      if (page.items.length === 0 || pageNo * PAGE_SIZE >= page.totalCount) {
        return result;
      }
    }
  }
}
