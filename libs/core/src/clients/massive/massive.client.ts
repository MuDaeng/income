import { BadGatewayException, Inject, Injectable, Logger } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { massiveConfig } from '@app/common';
import type {
  MassiveAggregateBar,
  MassiveAggregatesResponse,
  MassiveDividend,
  MassiveDividendsResponse,
  MassiveGroupedBar,
  MassiveGroupedResponse,
} from './massive.types.js';

const TIMEOUT_MS = 30_000;
/** 바를 만드는 데 쓰는 기본 집계 수의 최대치. 일봉 수년치도 한 번에 받도록 최대로 둠 */
const AGGREGATE_LIMIT = 50_000;
/** 429(요청 한도 초과)일 때 다시 시도하는 횟수와, Retry-After가 없을 때 기다리는 시간 */
const MAX_RETRIES = 5;
/** Dividends 한 페이지 최대 행 수와, next_url을 따라가는 최대 페이지 수 */
const DIVIDEND_LIMIT = 5_000;
const MAX_DIVIDEND_PAGES = 10;
export const RATE_LIMIT_WAIT_MS = 15_000;

/**
 * 요금제가 아직 공개하지 않은 날짜를 요청했을 때 (403, "before end of day").
 * Basic 요금제는 미국 동부 시간 자정이 지나야 그날 데이터를 준다. 원천 오류가 아니라 기다리면 되는 상황이라 따로 구분한다.
 */
export class MassiveDataNotReadyException extends BadGatewayException {}

/** Massive REST API 호출. API 키는 Authorization: Bearer로 보냄 */
@Injectable()
export class MassiveClient {
  private readonly logger = new Logger(MassiveClient.name);

  constructor(
    @Inject(massiveConfig.KEY)
    private readonly massive: ConfigType<typeof massiveConfig>,
  ) {}

  /**
   * 외환 일봉 (UTC 기준, 오래된 순).
   * @param ticker 예: 'C:USDKRW'
   * @param from 'YYYY-MM-DD'
   * @param to 'YYYY-MM-DD'
   */
  async getDailyForexBars(
    ticker: string,
    from: string,
    to: string,
  ): Promise<MassiveAggregateBar[]> {
    const path = ['/v2/aggs/ticker', ticker, 'range/1/day', from, to]
      .map((part, i) => (i % 2 === 1 ? encodeURIComponent(part) : part))
      .join('/');
    const url = new URL(path, this.massive.baseUrl);
    url.searchParams.set('adjusted', 'true');
    url.searchParams.set('sort', 'asc');
    url.searchParams.set('limit', String(AGGREGATE_LIMIT));

    const body = (await this.get(url, `시세(${ticker})`)) as MassiveAggregatesResponse;
    return body.results ?? [];
  }

  /**
   * 미국 주식 하루치 일봉 전체 (Daily Market Summary). 휴장일이면 빈 배열.
   * @param date 'YYYY-MM-DD' (미국 동부 기준 거래일)
   */
  async getGroupedDailyStocks(date: string): Promise<MassiveGroupedBar[]> {
    const url = new URL(
      `/v2/aggs/grouped/locale/us/market/stocks/${date}`,
      this.massive.baseUrl,
    );
    url.searchParams.set('adjusted', 'true');

    const body = (await this.get(url, `미국 주식 일봉(${date})`)) as MassiveGroupedResponse;
    return body.results ?? [];
  }

  /**
   * 종목의 현금배당 내역 (배당락일 오래된 순). next_url이 있으면 이어서 받는다.
   * @param ticker Massive 티커 (예: 'AAPL', 우선주는 'BACpP')
   * @param fromExDate 배당락일 'YYYY-MM-DD' 이상
   * @param toExDate 배당락일 'YYYY-MM-DD' 이하
   */
  async getDividends(
    ticker: string,
    fromExDate: string,
    toExDate: string,
  ): Promise<MassiveDividend[]> {
    let url: URL | null = new URL('/stocks/v1/dividends', this.massive.baseUrl);
    url.searchParams.set('ticker', ticker);
    url.searchParams.set('ex_dividend_date.gte', fromExDate);
    url.searchParams.set('ex_dividend_date.lte', toExDate);
    url.searchParams.set('limit', String(DIVIDEND_LIMIT));
    url.searchParams.set('sort', 'ex_dividend_date.asc');

    const dividends: MassiveDividend[] = [];
    for (let page = 0; url && page < MAX_DIVIDEND_PAGES; page++) {
      const body = (await this.get(url, `배당(${ticker})`)) as MassiveDividendsResponse;
      dividends.push(...(body.results ?? []));
      url = body.next_url ? new URL(body.next_url) : null;
    }
    return dividends;
  }

  /** 429면 Retry-After(없으면 15초)만큼 기다렸다 다시 시도. 그 밖의 비정상 응답은 502 */
  private async get(url: URL, what: string): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.massive.apiKey ?? ''}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok) {
        return response.json();
      }
      const detail = await response.text().catch(() => '');
      if (response.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : RATE_LIMIT_WAIT_MS;
        this.logger.warn(`Massive ${what} 요청 한도 초과, ${waitMs / 1000}초 후 다시 시도`);
        await sleep(waitMs);
        continue;
      }
      const message = `Massive ${what} 조회 실패: ${response.status} ${detail}`.trim();
      if (response.status === 403 && detail.includes('before end of day')) {
        throw new MassiveDataNotReadyException(message);
      }
      throw new BadGatewayException(message);
    }
  }
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
