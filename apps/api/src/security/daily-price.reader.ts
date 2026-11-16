import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  type FindOperator,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { DailySecurity } from '@app/common';

/** 저장된 종목 일별 시세 조회. 받아 저장하는 일은 DailyPriceFetcher(국내)·batch(미국)가 한다 */
@Injectable()
export class DailyPriceReader {
  constructor(
    @InjectRepository(DailySecurity)
    private readonly dailySecurityRepository: Repository<DailySecurity>,
  ) {}

  /** 그날의 시세 (없으면 null) */
  findOn(id: string, date: string): Promise<DailySecurity | null> {
    return this.dailySecurityRepository.findOneBy({ id, date });
  }

  /** 가장 최근 시세 (없으면 null) */
  findLatest(id: string): Promise<DailySecurity | null> {
    return this.dailySecurityRepository.findOne({
      where: { id },
      order: { date: 'DESC' },
    });
  }

  /** date(포함) 이전 가장 최근 시세 (없으면 null) */
  findLatestOnOrBefore(id: string, date: string): Promise<DailySecurity | null> {
    return this.dailySecurityRepository.findOne({
      where: { id, date: LessThanOrEqual(date) },
      order: { date: 'DESC' },
    });
  }

  /** 종목들의 date(포함)까지 시세 전부, 날짜 오름차순 */
  findUpTo(ids: string[], date: string): Promise<DailySecurity[]> {
    return this.dailySecurityRepository.find({
      where: { id: In(ids), date: LessThanOrEqual(date) },
      order: { date: 'ASC' },
    });
  }

  /** 종목 하나의 [from, to] 시세, 날짜 오름차순. from·to는 생략 가능(그쪽 끝 제한 없음) */
  findBetween(
    id: string,
    from: string | null,
    to: string | null,
  ): Promise<DailySecurity[]> {
    const date = dateFilter(from, to);
    return this.dailySecurityRepository.find({
      where: { id, ...(date ? { date } : {}) },
      order: { date: 'ASC' },
    });
  }
}

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
