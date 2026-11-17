import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Currency,
  DailySecurity,
  KisClient,
  type KisDailyPriceItem,
  type Security,
  truncateByCurrency,
} from '@app/common';
import { toYmd } from './iso-date.js';

/**
 * 국내(KRW) 종목 하나의 하루치 일별 시세를 KIS(한국투자증권)에서 받아 daily_security에 upsert한다 (조회 API의 온라인 보충용).
 * 주식·ETF 모두 같은 API. 전 종목 시세는 batch의 domestic-daily-prices 잡(data.go.kr)이 매일 받는다.
 */
@Injectable()
export class DailyPriceFetcher {
  constructor(
    @InjectRepository(DailySecurity)
    private readonly dailySecurityRepository: Repository<DailySecurity>,
    private readonly kisClient: KisClient,
  ) {}

  /** date 하루 시세를 저장하고 저장한 행 수(0 또는 1)를 돌려준다. 휴장일이면 0, KRW 외 통화도 0 */
  async fetchAndSave(security: Security, date: string): Promise<number> {
    if (security.currency !== Currency.KRW) {
      return 0;
    }
    const ymd = toYmd(date);
    const items = await this.kisClient.getDailyPrices(security.symbol, ymd, ymd);
    const rows = items
      .filter((item) => item.stck_bsop_date === ymd)
      .map((item) => toDailySecurity(security.id, item));
    if (rows.length > 0) {
      await this.dailySecurityRepository.upsert(rows, ['id', 'date']);
    }
    return rows.length;
  }
}

/** KIS 일봉 한 행 → daily_security 행 (원화 정수) */
const toDailySecurity = (id: string, item: KisDailyPriceItem) => ({
  id,
  date: `${item.stck_bsop_date.slice(0, 4)}-${item.stck_bsop_date.slice(4, 6)}-${item.stck_bsop_date.slice(6, 8)}`,
  openingPrice: toKrwPrice(item.stck_oprc),
  closingPrice: toKrwPrice(item.stck_clpr),
  highestPrice: toKrwPrice(item.stck_hgpr),
  lowestPrice: toKrwPrice(item.stck_lwpr),
});

/** 원화 정수로 버림. 빈 값이면 0 */
const toKrwPrice = (value: string) =>
  truncateByCurrency(value?.trim() || '0', Currency.KRW);
