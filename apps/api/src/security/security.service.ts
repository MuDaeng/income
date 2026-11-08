import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Currency, Security, SecurityType } from '@app/common';
import { TossClient } from '../toss/toss.client.js';
import type { TossMarket, TossSecurityType } from '../toss/toss.types.js';

/** 가져올 시장과 그 시장 종목의 통화 (Toss 목록 응답에는 통화가 없음) */
const MARKET_CURRENCY: [TossMarket, Currency][] = [
  ['KOSPI', Currency.KRW],
  ['KOSDAQ', Currency.KRW],
  ['NYSE', Currency.USD],
  ['NASDAQ', Currency.USD],
  ['AMEX', Currency.USD],
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

@Injectable()
export class SecurityService {
  constructor(
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    private readonly tossClient: TossClient,
  ) {}

  /**
   * Toss Open API로 코스피·코스닥·미국(NYSE·NASDAQ·AMEX) 전체 상장 종목을 받아 security에 넣는다.
   * id = ISIN, name·shortenedName = 한글 종목명, 통화는 시장으로 정함.
   * 이미 있는 종목은 이름·유형·통화를 갱신하므로(upsert) 다시 실행해도 된다.
   */
  async importFromToss(): Promise<ImportSecuritiesResult> {
    const byIsin = new Map<string, Partial<Security>>();
    const markets: ImportSecuritiesResult['markets'] = {};

    for (const [index, [market, currency]] of MARKET_CURRENCY.entries()) {
      if (index > 0) {
        await sleep(MARKET_INTERVAL_MS);
      }
      const stocks = await this.tossClient.listStocks(market);
      markets[market] = stocks.length;
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
    return { total: securities.length, markets };
  }
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
