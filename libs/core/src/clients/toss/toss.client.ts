import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { tossConfig } from '@app/common';
import type { TossListedStock, TossMarket } from './toss.types.js';

const TIMEOUT_MS = 30_000;
/** 만료 직전 토큰으로 호출하다 401이 나지 않도록 이만큼 일찍 재발급 */
const TOKEN_REFRESH_MARGIN_MS = 60_000;

/**
 * Toss Open API 호출.
 * access token은 메모리에 두고 만료 전까지 재사용한다. Toss는 클라이언트당 유효 토큰이 하나뿐이라
 * 새로 발급하면 이전 토큰이 바로 무효가 되므로, 호출마다 발급하면 안 된다.
 */
@Injectable()
export class TossClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    @Inject(tossConfig.KEY)
    private readonly toss: ConfigType<typeof tossConfig>,
  ) {}

  /**
   * 시장의 전체 상장 종목 (상장 중인 종목만, 페이지 없이 한 번에).
   * 401이면 메모리 토큰을 버리고 한 번만 재발급해서 다시 호출한다 — api와 batch가 각자 토큰을 들고 있어서
   * 한쪽이 새로 발급하면 다른 쪽 토큰은 바로 무효가 된다.
   */
  async listStocks(market: TossMarket): Promise<TossListedStock[]> {
    const url = new URL('/api/v1/stocks/all', this.toss.baseUrl);
    url.searchParams.set('market', market);
    const call = async () =>
      fetch(url, {
        headers: { Authorization: `Bearer ${await this.getAccessToken()}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    let response = await call();
    if (response.status === 401) {
      this.token = null;
      response = await call();
    }
    const body = (await this.parse(response, `종목 목록(${market})`)) as {
      result: TossListedStock[];
    };
    return body.result;
  }

  async getAccessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) {
      return this.token.value;
    }
    const response = await fetch(new URL('/oauth2/token', this.toss.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.toss.clientId ?? '',
        client_secret: this.toss.clientSecret ?? '',
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await this.parse(response, '토큰 발급')) as {
      access_token: string;
      expires_in: number;
    };
    this.token = {
      value: body.access_token,
      expiresAt: Date.now() + body.expires_in * 1000 - TOKEN_REFRESH_MARGIN_MS,
    };
    return this.token.value;
  }

  /** 2xx면 JSON 본문, 아니면 Toss 오류 내용을 담아 502 */
  private async parse(response: Response, what: string): Promise<unknown> {
    if (response.ok) {
      return response.json();
    }
    const detail = await response.text().catch(() => '');
    const hint =
      response.status === 403 ? ' (Toss 허용 IP에 이 서버 IP를 등록해야 합니다)' : '';
    throw new BadGatewayException(
      `Toss ${what} 실패: ${response.status}${hint} ${detail}`.trim(),
    );
  }
}
