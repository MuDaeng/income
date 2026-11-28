import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Currency } from './currency.enum.js';
import { truncateRate } from './currency-decimal.js';
import { DailyExchangeRate } from './daily-exchange-rate.entity.js';
import { addYears, formatIsoDate } from '../base/iso-date.js';
import { upsertInChunks } from '../base/upsert-in-chunks.js';
import { MassiveClient } from '../client/massive/massive.client.js';

/** 달러당 원화 (DailyExchangeRate의 currency=USD 행) */
const USD_KRW_TICKER = 'C:USDKRW';
/** 기간을 생략했을 때 가져올 햇수 (Currencies Basic 플랜은 2년치만 제공) */
const DEFAULT_YEARS = 2;

/** 가져올 기간 'YYYY-MM-DD' (둘 다 생략 가능) */
export interface ImportExchangeRatesInput {
  /** 시작일. 생략하면 종료일의 2년 전 */
  from?: string;
  /** 종료일. 생략하면 오늘(UTC) */
  to?: string;
}

export interface ImportExchangeRatesResult {
  from: string;
  to: string;
  total: number;
  firstDate: string | null;
  lastDate: string | null;
}

@Injectable()
export class ExchangeRateFetcher {
  constructor(
    @InjectRepository(DailyExchangeRate)
    private readonly dailyExchangeRateRepository: Repository<DailyExchangeRate>,
    private readonly massiveClient: MassiveClient,
  ) {}

  /**
   * Massive에서 USD/KRW 일봉을 받아 daily_exchange_rate(currency=USD)에 넣는다.
   * 날짜는 바 시작 시각의 UTC 날짜. 이미 있는 날짜는 갱신하므로(upsert) 다시 실행해도 된다.
   */
  async importFromMassive(
    input: ImportExchangeRatesInput,
  ): Promise<ImportExchangeRatesResult> {
    const to = input.to ?? formatIsoDate(new Date());
    const from = input.from ?? addYears(to, -DEFAULT_YEARS);

    const bars = await this.massiveClient.getDailyForexBars(
      USD_KRW_TICKER,
      from,
      to,
    );
    const rates: Partial<DailyExchangeRate>[] = bars.map((bar) => ({
      date: formatIsoDate(new Date(bar.t)),
      currency: Currency.USD,
      openingRate: truncateRate(bar.o),
      closingRate: truncateRate(bar.c),
      highestRate: truncateRate(bar.h),
      lowestRate: truncateRate(bar.l),
    }));

    await upsertInChunks(this.dailyExchangeRateRepository, rates, [
      'date',
      'currency',
    ]);
    return {
      from,
      to,
      total: rates.length,
      firstDate: rates.at(0)?.date ?? null,
      lastDate: rates.at(-1)?.date ?? null,
    };
  }
}
