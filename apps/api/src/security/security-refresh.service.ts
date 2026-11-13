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
import { addYears, todayInSeoul } from './iso-date.js';

/** 지난 배당·시세는 이만큼 거슬러 받는다 (Massive Basic도 2년치까지) */
const PAST_YEARS = 2;
/** 공시된 앞으로의 배당까지 받으려고 오늘 이후로도 조회 */
const DIVIDEND_FUTURE_YEARS = 1;

/**
 * 조회 API에서 종목 데이터를 온라인으로 갱신한다. 종목·종류별로 하루에 한 번만 원천을 호출한다.
 * 조회일은 security_search에 (종목, 종류)마다 따로 남긴다.
 * - INCOME(배당): lastSearchDate가 오늘(한국 시간)이 아니면 오늘-2년 ~ 오늘+1년 배당을 받는다
 * - PRICE(일별 시세): KRW 종목만, 오늘이 아니면 오늘-2년 ~ 오늘 시세를 받는다.
 *   USD 시세는 batch의 us-daily-prices 잡이 매일 전 종목을 받으므로 여기서는 받지 않는다.
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
    const searchedToday = (type: SearchType) =>
      searches.some(
        (search) => search.type === type && search.lastSearchDate === today,
      );

    const label = `${security.symbol}(${security.id})`;
    const from = addYears(today, -PAST_YEARS);
    if (!searchedToday(SearchType.INCOME)) {
      await this.refreshType(security, SearchType.INCOME, today, async () => {
        const { fetched, saved } = await this.dividendService.fetchAndSave(
          security,
          from,
          addYears(today, DIVIDEND_FUTURE_YEARS),
        );
        return `배당 갱신 ${label}: ${fetched}건 중 ${saved}건 저장`;
      });
    }
    if (
      security.currency === Currency.KRW &&
      !searchedToday(SearchType.PRICE)
    ) {
      await this.refreshType(security, SearchType.PRICE, today, async () => {
        const saved = await this.dailyPriceFetcher.fetchAndSave(
          security,
          from,
          today,
        );
        return `시세 갱신 ${label}: ${saved}건 저장`;
      });
    }
  }

  /** 성공하면 결과를 로그로 남기고 그 종류의 조회일을 오늘로, 실패하면 오류만 로그로 남긴다 */
  private async refreshType(
    security: Security,
    type: SearchType,
    today: string,
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
      { id: security.id, type, lastSearchDate: today },
      ['id', 'type'],
    );
  }
}
