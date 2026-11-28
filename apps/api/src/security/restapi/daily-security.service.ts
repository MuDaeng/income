import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Security, todayInSeoul, truncateByCurrency } from '@app/common';
import type { DailyPriceResponse } from './dto/daily-price.dto.js';
import { DailyPriceReader } from '../daily-price.reader.js';
import type { DailyPriceRequest } from './dto/daily-price.schema.js';
import { SecurityRefresher } from '../security.refresher.js';

@Injectable()
export class DailySecurityService {
  constructor(
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    private readonly securityRefresher: SecurityRefresher,
    private readonly dailyPriceReader: DailyPriceReader,
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
    await this.securityRefresher.refresh(found);
    const { id, symbol, name, currency } = found;
    const security = { id, symbol, name, currency };

    const rows = await this.dailyPriceReader.findBetween(security.id, from, to);
    const price = (value: string) =>
      truncateByCurrency(value, security.currency);
    return {
      security,
      from,
      // 생략하면 오늘 (조회 범위는 그대로 끝까지)
      to: to ?? todayInSeoul(),
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
