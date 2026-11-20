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

/** KRX 거래일 판단에 쓰는 기준 종목 (삼성전자, 거래정지 가능성이 사실상 없음) */
export const KRW_CALENDAR_SECURITY_ID = 'KR7005930003';

/** 저장된 종목 일별 시세 조회. 받아 저장하는 일은 batch(국내·미국 전 종목)와 DailyPriceFetcher(국내 하루치 보충)가 한다 */
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

  /**
   * [from, to]의 KRX 거래일 'YYYY-MM-DD' 오름차순. 기준 종목(삼성전자) 시세가 있는 날을 거래일로 본다
   * (PK (id, date)로 읽으므로 전 종목 DISTINCT보다 가볍다). 국내 배당락일 계산에 쓴다
   */
  async findKrwTradingDays(from: string, to: string): Promise<string[]> {
    const rows = await this.dailySecurityRepository.find({
      select: { date: true },
      where: { id: KRW_CALENDAR_SECURITY_ID, date: Between(from, to) },
      order: { date: 'ASC' },
    });
    return rows.map((row) => row.date);
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
