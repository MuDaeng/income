import { BadGatewayException, Inject, Injectable, Logger } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { massiveConfig } from '@app/common';
import type {
  MassiveAggregateBar,
  MassiveAggregatesResponse,
  MassiveGroupedBar,
  MassiveGroupedResponse,
} from './massive.types.js';

const TIMEOUT_MS = 30_000;
/** 바를 만드는 데 쓰는 기본 집계 수의 최대치. 일봉 수년치도 한 번에 받도록 최대로 둠 */
const AGGREGATE_LIMIT = 50_000;
/** 429(요청 한도 초과)일 때 다시 시도하는 횟수와, Retry-After가 없을 때 기다리는 시간 */
const MAX_RETRIES = 5;
export const RATE_LIMIT_WAIT_MS = 15_000;

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
      throw new BadGatewayException(
        `Massive ${what} 조회 실패: ${response.status} ${detail}`.trim(),
      );
    }
  }
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
