import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Currency,
  DailySecurity,
  Security,
  truncateByCurrency,
} from '@app/common';
import { toMassiveTicker } from '../clients/massive/massive-ticker.js';
import { MassiveClient } from '../clients/massive/massive.client.js';

/** 기간을 생략했을 때 가져올 햇수 */
const DEFAULT_YEARS = 2;
const UPSERT_CHUNK = 1_000;

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

type DailySecurityRow = Pick<
  DailySecurity,
  | 'id'
  | 'date'
  | 'openingPrice'
  | 'closingPrice'
  | 'highestPrice'
  | 'lowestPrice'
>;

/** 미국 주식 일별 시세 가져오기 (api 수동 가져오기·batch 일배치 공용) */
@Injectable()
export class UsDailyPriceImportService {
  private readonly logger = new Logger(UsDailyPriceImportService.name);

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
   */
  async importFromMassive(
    input: ImportDailySecuritiesInput,
  ): Promise<ImportDailySecuritiesResult> {
    const to = input.to ?? toIsoDate(new Date());
    const from = input.from ?? yearsBefore(to, DEFAULT_YEARS);

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
      const bars = await this.massiveClient.getGroupedDailyStocks(date);
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
      for (let i = 0; i < prices.length; i += UPSERT_CHUNK) {
        await this.dailySecurityRepository.upsert(
          prices.slice(i, i + UPSERT_CHUNK),
          ['id', 'date'],
        );
      }

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

/** UTC 기준 'YYYY-MM-DD' */
const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const parseIsoDate = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);

const addDays = (isoDate: string, days: number) => {
  const date = parseIsoDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
};

const yearsBefore = (isoDate: string, years: number) => {
  const date = parseIsoDate(isoDate);
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return toIsoDate(date);
};

const isWeekend = (isoDate: string) => {
  const day = parseIsoDate(isoDate).getUTCDay();
  return day === 0 || day === 6;
};
