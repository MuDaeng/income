import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  addYears,
  Currency,
  krwPriceDate,
  SearchType,
  type Security,
  SecuritySearch,
  todayInSeoul,
} from '@app/common';
import { DailyPriceFetcher } from './daily-price.fetcher.js';
import { DailyPriceReader } from './daily-price.reader.js';
import { DividendFetcher } from './dividend.fetcher.js';

/** 국내(KRW) 배당을 받는 시작일 (KIS 예탁원 배당일정은 2000년부터) */
export const KRW_DIVIDEND_START = '2000-01-01';
/** USD 배당은 이만큼 거슬러 받는다 (Massive Basic은 2년치까지) */
const USD_DIVIDEND_PAST_YEARS = 2;
/** 공시된 앞으로의 배당까지 받으려고 오늘 이후로도 조회 */
const DIVIDEND_FUTURE_YEARS = 1;
/** 이미 받아 둔 종목은 마지막 조회일에서 이만큼 앞부터만 다시 받는다 (지급일이 나중에 정해지거나 바뀐 기준일을 다시 받으려고) */
const DIVIDEND_LOOKBACK_YEARS = 1;

/**
 * 조회 API에서 종목 데이터를 온라인으로 갱신한다.
 * 조회일과 받아 둔 구간의 시작일은 security_search에 (종목, 종류)마다 따로 남긴다.
 * - INCOME(배당): 하루에 한 번. KRW는 2000-01-01, USD는 오늘-2년부터 오늘+1년까지.
 *   받아 둔 구간(fromDate)이 이미 시작일을 덮으면 마지막 조회일 − 1년부터만 받는다.
 * - PRICE(일별 시세): KRW 종목만, 하루치. 한국 시간 15:30 전이면 어제, 이후면 오늘(krwPriceDate) 시세가
 *   daily_security에 없을 때만 KIS로 받는다. 그 날짜로 이미 조회했으면(lastSearchDate) 휴장일이라도 다시 부르지 않는다.
 *   전 종목 시세는 batch의 domestic-daily-prices 잡(data.go.kr)이, USD 시세는 us-daily-prices 잡이 받는다.
 * - 종류마다 성공했을 때만 그 종류의 lastSearchDate를 남긴다. 실패는 로그만 남기고 예외를 던지지 않아
 *   호출한 API는 저장분으로 응답하고, 다음 조회 때 그 종류만 다시 시도한다.
 * - 같은 종목의 갱신이 이미 진행 중이면 새로 부르지 않고 그 갱신을 함께 기다린다(inFlight).
 */
@Injectable()
export class SecurityRefresher {
  private readonly logger = new Logger(SecurityRefresher.name);
  /**
   * 종목별 진행 중인 갱신. 여러 조회 API가 동시에 같은 종목을 갱신하면 조회 기록이 남기 전이라
   * 모두 원천을 부르게 되므로(외부 API 한도 초과), 진행 중이면 그 갱신을 함께 기다린다.
   * pm2 프로세스 하나라 메모리로 충분하다
   */
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(
    @InjectRepository(SecuritySearch)
    private readonly securitySearchRepository: Repository<SecuritySearch>,
    private readonly dividendFetcher: DividendFetcher,
    private readonly dailyPriceFetcher: DailyPriceFetcher,
    private readonly dailyPriceReader: DailyPriceReader,
  ) {}

  async refresh(security: Security): Promise<void> {
    if (
      security.currency !== Currency.KRW &&
      security.currency !== Currency.USD
    ) {
      return;
    }
    const running = this.inFlight.get(security.id);
    if (running) {
      return running;
    }
    const refreshing = this.refreshNow(security).finally(() => {
      this.inFlight.delete(security.id);
    });
    this.inFlight.set(security.id, refreshing);
    return refreshing;
  }

  private async refreshNow(security: Security): Promise<void> {
    const today = todayInSeoul();
    const searches = await this.securitySearchRepository.findBy({
      id: security.id,
    });
    const searchOf = (type: SearchType) =>
      searches.find((search) => search.type === type);

    const label = `${security.symbol}(${security.id})`;
    const income = searchOf(SearchType.INCOME);
    if (income?.lastSearchDate !== today) {
      const start =
        security.currency === Currency.KRW
          ? KRW_DIVIDEND_START
          : addYears(today, -USD_DIVIDEND_PAST_YEARS);
      const range = rangeOf(income, start, (last) =>
        addYears(last, -DIVIDEND_LOOKBACK_YEARS),
      );
      await this.refreshType(
        security,
        SearchType.INCOME,
        { lastSearchDate: today, fromDate: range.fromDate },
        async () => {
          const { fetched, saved } = await this.dividendFetcher.fetchAndSave(
            security,
            range.from,
            addYears(today, DIVIDEND_FUTURE_YEARS),
          );
          return `배당 갱신 ${label} ${range.from}~: ${fetched}건 중 ${saved}건 저장`;
        },
      );
    }

    const priceDate = krwPriceDate();
    if (
      security.currency === Currency.KRW &&
      searchOf(SearchType.PRICE)?.lastSearchDate !== priceDate
    ) {
      await this.refreshType(
        security,
        SearchType.PRICE,
        { lastSearchDate: priceDate },
        async () => {
          if (await this.dailyPriceReader.findOn(security.id, priceDate)) {
            return `시세 ${label} ${priceDate}: 이미 있음`;
          }
          const saved = await this.dailyPriceFetcher.fetchAndSave(
            security,
            priceDate,
          );
          return `시세 갱신 ${label} ${priceDate}: ${saved}건 저장`;
        },
      );
    }
  }

  /** 성공하면 결과를 로그로 남기고 그 종류의 조회 기록(조회일 등)을 남긴다. 실패하면 오류만 로그로 남긴다 */
  private async refreshType(
    security: Security,
    type: SearchType,
    record: Pick<SecuritySearch, 'lastSearchDate'> &
      Partial<Pick<SecuritySearch, 'fromDate'>>,
    run: () => Promise<string>,
  ): Promise<void> {
    let message: string;
    try {
      message = await run();
    } catch (error) {
      this.logger.error(
        `${type} 갱신 실패 ${security.symbol}(${security.id}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    this.logger.log(message);
    await this.securitySearchRepository.upsert(
      { id: security.id, type, ...record },
      ['id', 'type'],
    );
  }
}

type FetchRange = {
  /** 이번에 받을 시작일 */
  from: string;
  /** 성공하면 남길 받아 둔 구간의 시작일 */
  fromDate: string;
};

/**
 * 받아 둔 구간(fromDate)이 start 이전부터면 최근 구간(recentFrom(lastSearchDate), start보다 앞으로는 안 감)만,
 * 아니면(처음이거나 fromDate가 없거나 더 늦으면) start부터 전부 받는다.
 * 'YYYY-MM-DD' 문자열은 사전순 = 날짜순.
 */
const rangeOf = (
  search: SecuritySearch | undefined,
  start: string,
  recentFrom: (lastSearchDate: string) => string,
): FetchRange => {
  if (search?.fromDate && search.fromDate <= start) {
    const recent = recentFrom(search.lastSearchDate);
    return {
      from: recent > start ? recent : start,
      fromDate: search.fromDate,
    };
  }
  return { from: start, fromDate: start };
};
