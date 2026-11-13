import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Currency,
  DailySecurity,
  type Security,
  SecurityType,
  truncateByCurrency,
} from '@app/common';
import {
  DataGoKrClient,
  MassiveClient,
  toMassiveTicker,
  type PriceItem,
} from '@app/core';
import { addDays, formatIsoDate, toYmd } from './iso-date.js';

/** 종목 하나 2년치는 수백 행이라 한 페이지면 충분 (data.go.kr 최대) */
const PAGE_SIZE = 10_000;
const UPSERT_CHUNK = 1_000;

export type DailySecurityRow = Pick<
  DailySecurity,
  | 'id'
  | 'date'
  | 'openingPrice'
  | 'closingPrice'
  | 'highestPrice'
  | 'lowestPrice'
>;

/**
 * 종목 하나의 일별 시세를 원천에서 받아 daily_security에 upsert한다 (조회 API의 온라인 갱신용).
 * - KRW: data.go.kr를 ISIN으로 조회. ETF는 증권상품시세, 나머지는 주식시세
 * - USD: Massive Aggregates(종목 일봉), symbol을 Massive 티커로
 */
@Injectable()
export class DailyPriceFetcher {
  constructor(
    @InjectRepository(DailySecurity)
    private readonly dailySecurityRepository: Repository<DailySecurity>,
    private readonly dataGoKrClient: DataGoKrClient,
    private readonly massiveClient: MassiveClient,
  ) {}

  /** [from, to](포함) 시세를 저장하고 저장한 행 수를 돌려준다. KRW·USD 외 통화는 0 */
  async fetchAndSave(
    security: Security,
    from: string,
    to: string,
  ): Promise<number> {
    const rows =
      security.currency === Currency.KRW
        ? await this.fetchKrw(security, from, to)
        : security.currency === Currency.USD
          ? await this.fetchUsd(security, from, to)
          : [];
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      await this.dailySecurityRepository.upsert(
        rows.slice(i, i + UPSERT_CHUNK),
        ['id', 'date'],
      );
    }
    return rows.length;
  }

  private async fetchKrw(
    security: Security,
    from: string,
    to: string,
  ): Promise<DailySecurityRow[]> {
    const query = {
      beginBasDt: toYmd(from),
      // endBasDt는 그 날짜를 포함하지 않으므로 다음 날을 넘김
      endBasDt: toYmd(addDays(to, 1)),
      pageNo: 1,
      numOfRows: PAGE_SIZE,
      isinCd: security.id,
    };
    const page =
      security.type === SecurityType.ETF
        ? await this.dataGoKrClient.getEtfPrices(query)
        : await this.dataGoKrClient.getStockPrices(query);
    return page.items
      .filter((item) => item.isinCd === security.id)
      .map(toDailySecurity);
  }

  private async fetchUsd(
    security: Security,
    from: string,
    to: string,
  ): Promise<DailySecurityRow[]> {
    const bars = await this.massiveClient.getDailyStockBars(
      toMassiveTicker(security.symbol),
      from,
      to,
    );
    return bars.map((bar) => ({
      id: security.id,
      // 미국 주식 일봉의 t는 미국 동부 자정이라 UTC 날짜가 곧 거래일
      date: formatIsoDate(new Date(bar.t)),
      openingPrice: truncateByCurrency(bar.o, Currency.USD),
      closingPrice: truncateByCurrency(bar.c, Currency.USD),
      highestPrice: truncateByCurrency(bar.h, Currency.USD),
      lowestPrice: truncateByCurrency(bar.l, Currency.USD),
    }));
  }
}

/** data.go.kr 일별 시세 한 행 → daily_security 행 (원화 정수) */
export const toDailySecurity = (item: PriceItem): DailySecurityRow => ({
  id: item.isinCd,
  date: `${item.basDt.slice(0, 4)}-${item.basDt.slice(4, 6)}-${item.basDt.slice(6, 8)}`,
  openingPrice: toKrwPrice(item.mkp),
  closingPrice: toKrwPrice(item.clpr),
  highestPrice: toKrwPrice(item.hipr),
  lowestPrice: toKrwPrice(item.lopr),
});

/** 원화 정수로 버림. 빈 값이 오면 new Decimal('')가 예외라 0으로 둠 (거래정지 종목은 원천에서도 0) */
const toKrwPrice = (value: string) =>
  truncateByCurrency(value?.trim() || '0', Currency.KRW);
