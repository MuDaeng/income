import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Currency, DailyExchangeRate } from '@app/common';

/** 저장된 USD 환율(KRW per USD) 조회. 환율 가져오기(Massive)는 batch의 @app/common ExchangeRateFetcher */
@Injectable()
export class ExchangeRateReader {
  constructor(
    @InjectRepository(DailyExchangeRate)
    private readonly dailyExchangeRateRepository: Repository<DailyExchangeRate>,
  ) {}

  /** 가장 최근 USD 환율 (없으면 null) */
  findLatestUsd(): Promise<DailyExchangeRate | null> {
    return this.dailyExchangeRateRepository.findOne({
      where: { currency: Currency.USD },
      order: { date: 'DESC' },
    });
  }

  /** date(포함) 이전 가장 최근 USD 환율 (없으면 null). cache를 주면 날짜별로 한 번만 조회 */
  async findUsdOnOrBefore(
    date: string,
    cache?: Map<string, DailyExchangeRate | null>,
  ): Promise<DailyExchangeRate | null> {
    if (cache?.has(date)) {
      return cache.get(date) ?? null;
    }
    const rate = await this.dailyExchangeRateRepository.findOne({
      where: { currency: Currency.USD, date: LessThanOrEqual(date) },
      order: { date: 'DESC' },
    });
    cache?.set(date, rate);
    return rate;
  }

  /** date(포함)까지의 USD 환율 전부, 날짜 오름차순 */
  findUsdUpTo(date: string): Promise<DailyExchangeRate[]> {
    return this.dailyExchangeRateRepository.find({
      where: { currency: Currency.USD, date: LessThanOrEqual(date) },
      order: { date: 'ASC' },
    });
  }
}
