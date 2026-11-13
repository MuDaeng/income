import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Currency, Security, SecurityType } from '@app/common';
import { TossClient } from '../clients/toss/toss.client.js';
import type {
  TossMarket,
  TossSecurityType,
} from '../clients/toss/toss.types.js';

/** 시장별 종목 통화 (Toss 목록 응답에는 통화가 없음) */
const MARKET_CURRENCY: Record<TossMarket, Currency> = {
  KOSPI: Currency.KRW,
  KOSDAQ: Currency.KRW,
  NYSE: Currency.USD,
  NASDAQ: Currency.USD,
  AMEX: Currency.USD,
  KR_ETC: Currency.KRW,
  US_ETC: Currency.USD,
};

/** 국내 시장 (국내 종목 배치) */
export const DOMESTIC_MARKETS: readonly TossMarket[] = ['KOSPI', 'KOSDAQ'];
/** 해외 시장 (해외 종목 배치) */
export const OVERSEAS_MARKETS: readonly TossMarket[] = [
  'NYSE',
  'NASDAQ',
  'AMEX',
];
export const ALL_MARKETS: readonly TossMarket[] = [
  ...DOMESTIC_MARKETS,
  ...OVERSEAS_MARKETS,
];

const TOSS_TYPE_TO_SECURITY_TYPE: Record<TossSecurityType, SecurityType> = {
  STOCK: SecurityType.STOCK,
  FOREIGN_STOCK: SecurityType.FOREIGN_STOCK,
  DEPOSITARY_RECEIPT: SecurityType.DEPOSITARY_RECEIPT,
  INFRASTRUCTURE_FUND: SecurityType.INFRASTRUCTURE_FUND,
  REIT: SecurityType.REIT,
  ETF: SecurityType.ETF,
  FOREIGN_ETF: SecurityType.FOREIGN_ETF,
  ETN: SecurityType.ETN,
  STOCK_WARRANTS: SecurityType.STOCK_WARRANTS,
};

/** Toss `stocks/all`의 속도 제한이 1회/초라 시장 사이에 기다리는 시간 */
export const MARKET_INTERVAL_MS = 1_100;
const UPSERT_CHUNK = 1_000;

export interface ImportSecuritiesResult {
  total: number;
  markets: Partial<Record<TossMarket, number>>;
}

/** Toss 상장 종목 목록을 security에 넣는다. api(수동 가져오기)와 batch(일배치)가 같이 쓴다 */
@Injectable()
export class SecurityImportService {
  constructor(
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    private readonly tossClient: TossClient,
  ) {}

  /**
   * Toss Open API로 주어진 시장(기본: 코스피·코스닥·NYSE·NASDAQ·AMEX 전체)의 상장 종목을 받아 security에 넣는다.
   * id = ISIN, name·shortenedName = 한글 종목명, 통화는 시장으로 정함.
   * 이미 있는 종목은 이름·유형·통화를 갱신하므로(upsert) 다시 실행해도 되고, 새로 상장된 종목은 추가된다.
   */
  async importFromToss(
    markets: readonly TossMarket[] = ALL_MARKETS,
  ): Promise<ImportSecuritiesResult> {
    const byIsin = new Map<string, Partial<Security>>();
    const counts: ImportSecuritiesResult['markets'] = {};

    for (const [index, market] of markets.entries()) {
      if (index > 0) {
        await sleep(MARKET_INTERVAL_MS);
      }
      const currency = MARKET_CURRENCY[market];
      const stocks = await this.tossClient.listStocks(market);
      counts[market] = stocks.length;
      for (const stock of stocks) {
        byIsin.set(stock.isinCode, {
          id: stock.isinCode,
          type: TOSS_TYPE_TO_SECURITY_TYPE[stock.securityType],
          name: stock.name,
          shortenedName: stock.name,
          symbol: stock.symbol,
          currency,
        });
      }
    }

    const securities = [...byIsin.values()];
    for (let i = 0; i < securities.length; i += UPSERT_CHUNK) {
      await this.securityRepository.upsert(
        securities.slice(i, i + UPSERT_CHUNK),
        ['id'],
      );
    }
    return { total: securities.length, markets: counts };
  }
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
