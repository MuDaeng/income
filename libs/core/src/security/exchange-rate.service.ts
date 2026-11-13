import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { Repository } from 'typeorm';
import { Currency, DailyExchangeRate } from '@app/common';
import { MassiveClient } from '../clients/massive/massive.client.js';

/** 달러당 원화 (DailyExchangeRate의 currency=USD 행) */
const USD_KRW_TICKER = 'C:USDKRW';
/** 기간을 생략했을 때 가져올 햇수 (Currencies Basic 플랜은 2년치만 제공) */
const DEFAULT_YEARS = 2;
const UPSERT_CHUNK = 1_000;

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
export class ExchangeRateService {
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
    const to = input.to ?? toIsoDate(new Date());
    const from = input.from ?? yearsBefore(to, DEFAULT_YEARS);

    const bars = await this.massiveClient.getDailyForexBars(
      USD_KRW_TICKER,
      from,
      to,
    );
    const rates: Partial<DailyExchangeRate>[] = bars.map((bar) => ({
      date: toIsoDate(new Date(bar.t)),
      currency: Currency.USD,
      openingRate: toRate(bar.o),
      closingRate: toRate(bar.c),
      highestRate: toRate(bar.h),
      lowestRate: toRate(bar.l),
    }));

    for (let i = 0; i < rates.length; i += UPSERT_CHUNK) {
      await this.dailyExchangeRateRepository.upsert(
        rates.slice(i, i + UPSERT_CHUNK),
        ['date', 'currency'],
      );
    }
    return {
      from,
      to,
      total: rates.length,
      firstDate: rates.at(0)?.date ?? null,
      lastDate: rates.at(-1)?.date ?? null,
    };
  }
}

/** UTC 기준 'YYYY-MM-DD' */
const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const yearsBefore = (isoDate: string, years: number) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return toIsoDate(date);
};

/**
 * 환율은 소수가 필요하므로 truncateByCurrency(KRW → 정수)를 쓰지 않고,
 * 컬럼 자릿수(DECIMAL(20, 6))에 맞춰 소수 6자리로 버림
 */
const toRate = (value: number) =>
  new Decimal(value).toDecimalPlaces(6, Decimal.ROUND_DOWN).toFixed();
