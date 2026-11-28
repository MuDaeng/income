import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Currency } from './currency.enum.js';
import { truncateByCurrency } from './currency-decimal.js';
import { DailySecurity } from './daily-security.entity.js';
import { Security } from './security.entity.js';
import {
  addDays,
  addYears,
  formatIsoDate,
  isWeekend,
} from '../base/iso-date.js';
import { upsertInChunks } from '../base/upsert-in-chunks.js';
import { toMassiveTicker } from '../client/massive/massive-ticker.js';
import {
  MassiveClient,
  MassiveDataNotReadyException,
} from '../client/massive/massive.client.js';
import type { MassiveGroupedBar } from '../client/massive/massive.types.js';

/** 기간을 생략했을 때 가져올 햇수 */
const DEFAULT_YEARS = 2;

/** 'YYYY-MM-DD', 둘 다 포함. 생략하면 to = 오늘(UTC), from = to - 2년 */
export interface ImportDailySecuritiesInput {
  from?: string;
  to?: string;
}

export interface ImportDailySecuritiesResult {
  from: string;
  to: string;
  /** 원천(data.go.kr·Massive)에서 받은 행 수 */
  fetched: number;
  /** daily_security에 저장한 행 수 */
  saved: number;
  /** security에 없는 종목(ISIN·티커)이라 건너뛴 행 수 */
  skipped: number;
  firstDate: string | null;
  lastDate: string | null;
}

/** daily_security에 upsert하는 한 행 (us·domestic 시세 가져오기 공통) */
export type DailySecurityRow = Pick<
  DailySecurity,
  | 'id'
  | 'date'
  | 'openingPrice'
  | 'closingPrice'
  | 'highestPrice'
  | 'lowestPrice'
>;

/** 미국 주식 일별 시세 가져오기 (batch us-daily-prices 잡) */
@Injectable()
export class UsDailyPriceFetcher {
  private readonly logger = new Logger(UsDailyPriceFetcher.name);

  constructor(
    @InjectRepository(DailySecurity)
    private readonly dailySecurityRepository: Repository<DailySecurity>,
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    private readonly massiveClient: MassiveClient,
  ) {}

  /**
   * Massive Daily Market Summary로 미국 주식 일봉을 받아 daily_security에 넣는다.
   * 하루에 한 번 호출해 그날 전체 종목을 받고(주말은 건너뜀, 휴장일은 빈 결과),
   * security의 USD 종목과 티커(symbol)로 맞춰 저장한다. 가격은 소수 6자리 버림.
   * 요금제가 아직 공개하지 않은 날짜(미국 동부 자정 전)를 만나면 그날부터는 건너뛰고 받은 데까지 돌려준다.
   */
  async importFromMassive(
    input: ImportDailySecuritiesInput,
  ): Promise<ImportDailySecuritiesResult> {
    const to = input.to ?? formatIsoDate(new Date());
    const from = input.from ?? addYears(to, -DEFAULT_YEARS);

    const usdSecurities = await this.securityRepository.find({
      select: { id: true, symbol: true },
      where: { currency: Currency.USD },
    });
    const idByTicker = new Map(
      usdSecurities.map(({ id, symbol }) => [toMassiveTicker(symbol), id]),
    );

    const result: ImportDailySecuritiesResult = {
      from,
      to,
      fetched: 0,
      saved: 0,
      skipped: 0,
      firstDate: null,
      lastDate: null,
    };
    for (let date = from; date <= to; date = addDays(date, 1)) {
      if (isWeekend(date)) {
        continue;
      }
      let bars: MassiveGroupedBar[];
      try {
        bars = await this.massiveClient.getGroupedDailyStocks(date);
      } catch (error) {
        if (error instanceof MassiveDataNotReadyException) {
          this.logger.warn(
            `미국 일별 시세 ${date}: 아직 공개 전이라 ${date} ~ ${to}는 건너뜀`,
          );
          break;
        }
        throw error;
      }
      const prices: DailySecurityRow[] = [];
      for (const bar of bars) {
        const id = idByTicker.get(bar.T);
        if (id) {
          prices.push({
            id,
            date,
            openingPrice: truncateByCurrency(bar.o, Currency.USD),
            closingPrice: truncateByCurrency(bar.c, Currency.USD),
            highestPrice: truncateByCurrency(bar.h, Currency.USD),
            lowestPrice: truncateByCurrency(bar.l, Currency.USD),
          });
        }
      }
      await upsertInChunks(this.dailySecurityRepository, prices, ['id', 'date']);

      result.fetched += bars.length;
      result.saved += prices.length;
      result.skipped += bars.length - prices.length;
      if (prices.length > 0) {
        result.firstDate ??= date;
        result.lastDate = date;
      }
      this.logger.log(
        `미국 일별 시세 ${date}: ${bars.length}행 중 ${prices.length}행 저장 (누적 ${result.saved})`,
      );
    }
    return result;
  }
}
