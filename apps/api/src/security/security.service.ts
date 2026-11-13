import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { DailySecurity, Security, truncateByCurrency } from '@app/common';
import type { SearchSecuritiesRequest } from './search-securities.schema.js';
import type { SecuritySearchItemDto } from './security-search.dto.js';

/** 종목 검색 결과 최대 건수 */
export const SEARCH_LIMIT = 20;

/** 종목 검색. 종목 목록 가져오기(Toss)는 batch의 @app/core SecurityImportService */
@Injectable()
export class SecurityService {
  constructor(
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    @InjectRepository(DailySecurity)
    private readonly dailySecurityRepository: Repository<DailySecurity>,
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
}

/** LIKE 패턴의 특수문자(\ % _)를 글자 그대로 찾도록 escape (MySQL 기본 escape 문자는 \) */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');
