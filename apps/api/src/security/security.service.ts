import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import {
  Currency,
  DailySecurity,
  Security,
  SecurityType,
  truncateByCurrency,
} from '@app/common';
import { TossClient } from '../clients/toss/toss.client.js';
import type { TossMarket, TossSecurityType } from '../clients/toss/toss.types.js';
import type { SearchSecuritiesRequest } from './search-securities.schema.js';
import type { SecuritySearchItemDto } from './security-search.dto.js';

/** 종목 검색 결과 최대 건수 */
export const SEARCH_LIMIT = 20;

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
    @InjectRepository(DailySecurity)
    private readonly dailySecurityRepository: Repository<DailySecurity>,
    private readonly tossClient: TossClient,
  ) {}

  /**
   * 종목 검색. symbol 완전일치(대소문자 무시) → 종목명 완전일치 → 종목명에 keyword가 들어간 종목(종목명 순)
   * 순서로 중복 없이 합쳐 최대 SEARCH_LIMIT건. ISIN으로는 찾지 않는다.
   * 종목마다 저장된 최근 종가를 붙인다 (없으면 null).
   */
  async searchSecurities(
    input: SearchSecuritiesRequest,
  ): Promise<SecuritySearchItemDto[]> {
    const { keyword } = input;
    const bySymbol = await this.securityRepository.find({
      where: { symbol: keyword },
      order: { id: 'ASC' },
      take: SEARCH_LIMIT,
    });
    const byExactName = await this.securityRepository.find({
      where: { name: keyword },
      order: { id: 'ASC' },
      take: SEARCH_LIMIT,
    });
    const byName = await this.securityRepository.find({
      where: { name: Like(`%${escapeLike(keyword)}%`) },
      order: { name: 'ASC', id: 'ASC' },
      take: SEARCH_LIMIT,
    });
    const seen = new Set<string>();
    const securities = [...bySymbol, ...byExactName, ...byName]
      .filter((security) => !seen.has(security.id) && seen.add(security.id))
      .slice(0, SEARCH_LIMIT);

    const items: SecuritySearchItemDto[] = [];
    for (const { id, symbol, name, currency } of securities) {
      const latest = await this.dailySecurityRepository.findOne({
        where: { id },
        order: { date: 'DESC' },
      });
      items.push({
        id,
        symbol,
        name,
        currency,
        closingPrice: latest
          ? truncateByCurrency(latest.closingPrice, currency)
          : null,
        priceDate: latest?.date ?? null,
      });
    }
    return items;
  }

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

/** LIKE 패턴의 특수문자(\ % _)를 글자 그대로 찾도록 escape (MySQL 기본 escape 문자는 \) */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');
