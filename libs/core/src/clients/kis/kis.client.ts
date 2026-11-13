import { BadGatewayException, Inject, Injectable, Logger } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientToken, ClientType, kisConfig } from '@app/common';
import type {
  KisDividendItem,
  KisDividendResponse,
  KisTokenResponse,
} from './kis.types.js';

const TIMEOUT_MS = 30_000;
const DIVIDEND_PATH = '/uapi/domestic-stock/v1/ksdinfo/dividend';
/** 예탁원정보(배당일정) 거래 ID */
const DIVIDEND_TR_ID = 'HHKDB669102C0';
/** 연속조회는 이만큼만 따라간다 (한 종목 범위라 보통 한 번에 끝남) */
const MAX_PAGES = 20;
/** KIS가 토큰 만료·무효를 HTTP 500 본문으로 알려줄 때의 msg_cd */
const INVALID_TOKEN_CODES = new Set(['EGW00121', 'EGW00123']);

/** 토큰 만료·무효. 재발급 후 한 번 다시 호출한다 */
class KisTokenExpiredError extends Error {}

/**
 * 한국투자증권(KIS) Open API 호출.
 * access token은 client_token(clientType = KIS)에 저장해 재사용한다. 호출마다 발급하지 않고,
 * 토큰이 없을 때와 401(만료)일 때만 새로 발급해 저장한다.
 */
@Injectable()
export class KisClient {
  private readonly logger = new Logger(KisClient.name);

  constructor(
    @Inject(kisConfig.KEY)
    private readonly kis: ConfigType<typeof kisConfig>,
    @InjectRepository(ClientToken)
    private readonly clientTokenRepository: Repository<ClientToken>,
  ) {}

  /** 국내 종목(6자리 단축코드)의 배당일정. 기간은 기준일 'YYYYMMDD' */
  async getDividends(
    symbol: string,
    fromDt: string,
    toDt: string,
  ): Promise<KisDividendItem[]> {
    const stored = await this.clientTokenRepository.findOneBy({
      clientType: ClientType.KIS,
    });
    const token = stored?.token ?? (await this.issueToken());
    try {
      return await this.fetchDividends(token, symbol, fromDt, toDt);
    } catch (error) {
      if (!(error instanceof KisTokenExpiredError)) {
        throw error;
      }
      this.logger.log('KIS 토큰 만료, 재발급 후 다시 조회');
      const renewed = await this.issueToken();
      try {
        return await this.fetchDividends(renewed, symbol, fromDt, toDt);
      } catch (retryError) {
        if (retryError instanceof KisTokenExpiredError) {
          throw new BadGatewayException(
            `KIS 배당 조회 실패: 새 토큰도 거부됨 ${retryError.message}`,
          );
        }
        throw retryError;
      }
    }
  }

  /** 새 access token을 발급해 client_token에 저장 */
  private async issueToken(): Promise<string> {
    const response = await fetch(new URL('/oauth2/tokenP', this.kis.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: this.kis.appKey ?? '',
        appsecret: this.kis.appSecret ?? '',
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new BadGatewayException(
        `KIS 토큰 발급 실패: ${response.status} ${text.slice(0, 300)}`.trim(),
      );
    }
    const { access_token: token } = JSON.parse(text) as KisTokenResponse;
    await this.clientTokenRepository.save(
      this.clientTokenRepository.create({ clientType: ClientType.KIS, token }),
    );
    return token;
  }

  private async fetchDividends(
    token: string,
    symbol: string,
    fromDt: string,
    toDt: string,
  ): Promise<KisDividendItem[]> {
    const items: KisDividendItem[] = [];
    let cts = '';
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(DIVIDEND_PATH, this.kis.baseUrl);
      url.search = new URLSearchParams({
        CTS: cts,
        GB1: '0', // 전체(결산·중간)
        F_DT: fromDt,
        T_DT: toDt,
        SHT_CD: symbol,
        HIGH_GB: '',
      }).toString();
      const response = await fetch(url, {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          authorization: `Bearer ${token}`,
          appkey: this.kis.appKey ?? '',
          appsecret: this.kis.appSecret ?? '',
          tr_id: DIVIDEND_TR_ID,
          custtype: 'P',
          ...(page > 0 ? { tr_cont: 'N' } : {}),
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await response.text();
      const body = parseJson(text);
      if (
        response.status === 401 ||
        (body && INVALID_TOKEN_CODES.has(body.msg_cd))
      ) {
        throw new KisTokenExpiredError(`${response.status} ${text.slice(0, 300)}`);
      }
      if (!response.ok || !body || body.rt_cd !== '0') {
        throw new BadGatewayException(
          `KIS 배당 조회 실패: ${response.status} ${text.slice(0, 300)}`.trim(),
        );
      }
      items.push(...(body.output1 ?? []));

      // 응답 헤더 tr_cont가 M/F면 다음 데이터가 있음
      const trCont = response.headers.get('tr_cont');
      const next = body.CTS?.trim();
      if ((trCont !== 'M' && trCont !== 'F') || !next) {
        break;
      }
      cts = next;
    }
    return items;
  }
}

const parseJson = (text: string): KisDividendResponse | null => {
  try {
    return JSON.parse(text) as KisDividendResponse;
  } catch {
    return null;
  }
};
