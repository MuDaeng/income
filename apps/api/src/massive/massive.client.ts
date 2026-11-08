import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { massiveConfig } from '@app/common';
import type {
  MassiveAggregateBar,
  MassiveAggregatesResponse,
} from './massive.types.js';

const TIMEOUT_MS = 30_000;
/** 바를 만드는 데 쓰는 기본 집계 수의 최대치. 일봉 수년치도 한 번에 받도록 최대로 둠 */
const AGGREGATE_LIMIT = 50_000;

/** Massive REST API 호출. API 키는 Authorization: Bearer로 보냄 */
@Injectable()
export class MassiveClient {
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

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.massive.apiKey ?? ''}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new BadGatewayException(
        `Massive 시세(${ticker}) 조회 실패: ${response.status} ${detail}`.trim(),
      );
    }
    const body = (await response.json()) as MassiveAggregatesResponse;
    return body.results ?? [];
  }
}
