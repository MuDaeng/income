import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Currency,
  SearchType,
  type Security,
  SecuritySearch,
} from '@app/common';
import { DailyPriceFetcher } from './daily-price.fetcher.js';
import { DividendService } from './dividend.service.js';
import { addDays, addYears, todayInSeoul } from './iso-date.js';

/** 국내(KRW) 시세·배당을 받는 시작일. data.go.kr 일별 시세가 2020-01-02부터라 배당도 맞춘다 */
export const KRW_HISTORY_START = '2020-01-01';
/** USD 배당은 이만큼 거슬러 받는다 (Massive Basic은 2년치까지) */
const USD_DIVIDEND_PAST_YEARS = 2;
/** 공시된 앞으로의 배당까지 받으려고 오늘 이후로도 조회 */
const DIVIDEND_FUTURE_YEARS = 1;
/**
 * 이미 받아 둔 종목은 마지막 조회일에서 이만큼 앞부터만 다시 받는다.
 * 시세: data.go.kr은 영업일 하루 늦게 공개되고 휴장일이 끼므로 7일.
 * 배당: 지급일이 나중에 정해지거나 바뀐 기준일을 다시 받으려고 1년.
 */
const PRICE_LOOKBACK_DAYS = 7;
const DIVIDEND_LOOKBACK_YEARS = 1;

/**
 * 조회 API에서 종목 데이터를 온라인으로 갱신한다. 종목·종류별로 하루에 한 번만 원천을 호출한다.
 * 조회일과 받아 둔 구간의 시작일은 security_search에 (종목, 종류)마다 따로 남긴다.
 * - INCOME(배당): KRW는 2020-01-01, USD는 오늘-2년부터 오늘+1년까지
 * - PRICE(일별 시세): KRW 종목만, 2020-01-01 ~ 오늘.
 *   USD 시세는 batch의 us-daily-prices 잡이 매일 전 종목을 받으므로 여기서는 받지 않는다.
 * - 받아 둔 구간(fromDate)이 이미 시작일을 덮으면 마지막 조회일 − 7일(시세)/1년(배당)부터만 받는다.
 * - 종류마다 성공했을 때만 그 종류의 lastSearchDate = 오늘. 실패는 로그만 남기고 예외를 던지지 않아
 *   호출한 API는 저장분으로 응답하고, 다음 조회 때 그 종류만 다시 시도한다.
 */
@Injectable()
export class SecurityRefreshService {
  private readonly logger = new Logger(SecurityRefreshService.name);

  constructor(
    @InjectRepository(SecuritySearch)
    private readonly securitySearchRepository: Repository<SecuritySearch>,
    private readonly dividendService: DividendService,
    private readonly dailyPriceFetcher: DailyPriceFetcher,
  ) {}

  async refresh(security: Security): Promise<void> {
    if (
      security.currency !== Currency.KRW &&
      security.currency !== Currency.USD
    ) {
      return;
    }
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
          ? KRW_HISTORY_START
          : addYears(today, -USD_DIVIDEND_PAST_YEARS);
      const range = rangeOf(income, start, (last) =>
        addYears(last, -DIVIDEND_LOOKBACK_YEARS),
      );
      await this.refreshType(security, SearchType.INCOME, today, range, async () => {
        const { fetched, saved } = await this.dividendService.fetchAndSave(
          security,
          range.from,
          addYears(today, DIVIDEND_FUTURE_YEARS),
        );
        return `배당 갱신 ${label} ${range.from}~: ${fetched}건 중 ${saved}건 저장`;
      });
    }
    const price = searchOf(SearchType.PRICE);
    if (security.currency === Currency.KRW && price?.lastSearchDate !== today) {
      const range = rangeOf(price, KRW_HISTORY_START, (last) =>
        addDays(last, -PRICE_LOOKBACK_DAYS),
      );
      await this.refreshType(security, SearchType.PRICE, today, range, async () => {
        const saved = await this.dailyPriceFetcher.fetchAndSave(
          security,
          range.from,
          today,
        );
        return `시세 갱신 ${label} ${range.from}~: ${saved}건 저장`;
      });
    }
  }

  /** 성공하면 결과를 로그로 남기고 그 종류의 조회일·받아 둔 시작일을 남긴다. 실패하면 오류만 로그로 남긴다 */
  private async refreshType(
    security: Security,
    type: SearchType,
    today: string,
    range: FetchRange,
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
      { id: security.id, type, lastSearchDate: today, fromDate: range.fromDate },
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
