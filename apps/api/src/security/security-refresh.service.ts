import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Currency, type Security, SecuritySearch } from '@app/common';
import { DailyPriceFetcher } from './daily-price.fetcher.js';
import { DividendService } from './dividend.service.js';
import { addYears, todayInSeoul } from './iso-date.js';

/** 지난 배당·시세는 이만큼 거슬러 받는다 (Massive Basic도 2년치까지) */
const PAST_YEARS = 2;
/** 공시된 앞으로의 배당까지 받으려고 오늘 이후로도 조회 */
const DIVIDEND_FUTURE_YEARS = 1;

/**
 * 조회 API에서 종목 데이터를 온라인으로 갱신한다. 종목별로 하루에 한 번만 원천을 호출한다.
 * - security_search.lastSearchDate가 오늘(한국 시간)이면 아무것도 하지 않음
 * - 아니면 배당(오늘-2년 ~ 오늘+1년)과, KRW 종목은 일별 시세(오늘-2년 ~ 오늘)까지 함께 받아 저장
 *   (lastSearchDate 하나를 같이 쓰므로, 한쪽만 받고 날짜를 남기면 다른 쪽이 그날 빠진다)
 *   USD 시세는 batch의 us-daily-prices 잡이 매일 전 종목을 받으므로 여기서는 배당만 받는다.
 * - 둘 다 성공했을 때만 lastSearchDate = 오늘. 실패는 로그만 남기고 예외를 던지지 않아
 *   호출한 API는 저장분으로 응답하고, 다음 조회 때 다시 시도한다.
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
    const search = await this.securitySearchRepository.findOneBy({
      id: security.id,
    });
    if (search?.lastSearchDate === today) {
      return;
    }

    const label = `${security.symbol}(${security.id})`;
    const from = addYears(today, -PAST_YEARS);
    const dividendsOk = await this.attempt(`배당 갱신 ${label}`, async () => {
      const { fetched, saved } = await this.dividendService.fetchAndSave(
        security,
        from,
        addYears(today, DIVIDEND_FUTURE_YEARS),
      );
      return `${fetched}건 중 ${saved}건 저장`;
    });
    const pricesOk =
      security.currency !== Currency.KRW ||
      (await this.attempt(`시세 갱신 ${label}`, async () => {
        const saved = await this.dailyPriceFetcher.fetchAndSave(
          security,
          from,
          today,
        );
        return `${saved}건 저장`;
      }));

    if (dividendsOk && pricesOk) {
      await this.securitySearchRepository.upsert(
        { id: security.id, lastSearchDate: today },
        ['id'],
      );
    }
  }

  /** 성공하면 결과를 로그로 남기고 true, 실패하면 오류를 로그로 남기고 false */
  private async attempt(
    what: string,
    run: () => Promise<string>,
  ): Promise<boolean> {
    try {
      this.logger.log(`${what}: ${await run()}`);
      return true;
    } catch (error) {
      this.logger.error(
        `${what} 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
