import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  type FindOperator,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import {
  DailySecurity,
  Security,
  truncateByCurrency,
} from '@app/common';
import type { DailyPriceResponse } from './daily-price.dto.js';
import type { DailyPriceRequest } from './daily-price.schema.js';
import { SecurityRefreshService } from './security-refresh.service.js';

/** 날짜 기간 조건. 둘 다 없으면 null(조건 없음) */
const dateFilter = (
  from: string | null,
  to: string | null,
): FindOperator<string> | null => {
  if (from && to) {
    return Between(from, to);
  }
  if (from) {
    return MoreThanOrEqual(from);
  }
  if (to) {
    return LessThanOrEqual(to);
  }
  return null;
};

@Injectable()
export class DailySecurityService {
  constructor(
    @InjectRepository(DailySecurity)
    private readonly dailySecurityRepository: Repository<DailySecurity>,
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    private readonly securityRefreshService: SecurityRefreshService,
  ) {}

  /**
   * 종목 일별 시세 조회. id(ISIN)가 securityId와 같은 종목의 시세를 날짜 오름차순으로 돌려준다.
   * 종목이 없으면 404. 기간은 생략 가능. ISIN은 GET /securities(종목 검색)로 찾는다.
   * 읽기 전에 그 종목의 시세·배당을 원천에서 갱신한다(종목별 하루 한 번, 실패해도 저장분으로 응답).
   */
  async getDailyPrices(input: DailyPriceRequest): Promise<DailyPriceResponse> {
    const from = input.from ?? null;
    const to = input.to ?? null;

    const found = await this.securityRepository.findOneBy({
      id: input.securityId,
    });
    if (!found) {
      throw new NotFoundException('종목을 찾을 수 없습니다.');
    }
    await this.securityRefreshService.refresh(found);
    const { id, symbol, name, currency } = found;
    const security = { id, symbol, name, currency };

    const date = dateFilter(from, to);
    const rows = await this.dailySecurityRepository.find({
      where: { id: security.id, ...(date ? { date } : {}) },
      order: { date: 'ASC' },
    });
    const price = (value: string) =>
      truncateByCurrency(value, security.currency);
    return {
      security,
      from,
      to,
      prices: rows.map((row) => ({
        date: row.date,
        openingPrice: price(row.openingPrice),
        closingPrice: price(row.closingPrice),
        highestPrice: price(row.highestPrice),
        lowestPrice: price(row.lowestPrice),
      })),
    };
  }
}
