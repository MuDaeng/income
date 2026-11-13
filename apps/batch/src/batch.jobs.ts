import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  DOMESTIC_MARKETS,
  ExchangeRateService,
  OVERSEAS_MARKETS,
  SecurityImportService,
} from '@app/core';

/** 모든 잡의 실행 시각 기준 */
export const BATCH_TIME_ZONE = 'Asia/Seoul';
/** 환율은 최근 이만큼을 매일 다시 받는다 (빠진 날·덜 닫힌 바를 다음 실행 때 보정) */
export const EXCHANGE_RATE_LOOKBACK_DAYS = 7;

/** --run=<이름>으로 한 번 실행할 수 있는 잡 */
export const BATCH_JOB_NAMES = [
  'exchange-rates',
  'domestic-securities',
  'overseas-securities',
] as const;
export type BatchJobName = (typeof BATCH_JOB_NAMES)[number];

/**
 * 일배치 잡 (모두 한국 시간).
 * - 16:00 USD/KRW 일별 환율 (Massive)
 * - 17:00 국내 종목 목록 KOSPI·KOSDAQ (Toss) — 새로 상장된 종목 추가
 * - 08:00 해외 종목 목록 NYSE·NASDAQ·AMEX (Toss)
 * 일별 시세·배당은 배치가 아니라 조회 API에서 가져온다.
 * 각 잡은 실패해도 예외를 로그로 남기고 프로세스는 계속 돈다(다음 날 다시 실행).
 */
@Injectable()
export class BatchJobs {
  private readonly logger = new Logger(BatchJobs.name);

  constructor(
    private readonly exchangeRateService: ExchangeRateService,
    private readonly securityImportService: SecurityImportService,
  ) {}

  @Cron('0 16 * * *', {
    name: 'exchange-rates',
    timeZone: BATCH_TIME_ZONE,
    waitForCompletion: true,
  })
  importExchangeRates(): Promise<boolean> {
    const to = new Date().toISOString().slice(0, 10);
    const from = daysBefore(to, EXCHANGE_RATE_LOOKBACK_DAYS);
    return this.run('exchange-rates', () =>
      this.exchangeRateService.importFromMassive({ from, to }),
    );
  }

  @Cron('0 17 * * *', {
    name: 'domestic-securities',
    timeZone: BATCH_TIME_ZONE,
    waitForCompletion: true,
  })
  importDomesticSecurities(): Promise<boolean> {
    return this.run('domestic-securities', () =>
      this.securityImportService.importFromToss(DOMESTIC_MARKETS),
    );
  }

  @Cron('0 8 * * *', {
    name: 'overseas-securities',
    timeZone: BATCH_TIME_ZONE,
    waitForCompletion: true,
  })
  importOverseasSecurities(): Promise<boolean> {
    return this.run('overseas-securities', () =>
      this.securityImportService.importFromToss(OVERSEAS_MARKETS),
    );
  }

  /** 이름으로 잡 하나를 바로 실행 (main.ts의 --run) */
  runByName(name: BatchJobName): Promise<boolean> {
    switch (name) {
      case 'exchange-rates':
        return this.importExchangeRates();
      case 'domestic-securities':
        return this.importDomesticSecurities();
      case 'overseas-securities':
        return this.importOverseasSecurities();
    }
  }

  /** 시작·결과·소요 시간을 로그로 남긴다. 실패는 로그만 하고 false */
  private async run(name: BatchJobName, job: () => Promise<unknown>) {
    const startedAt = Date.now();
    this.logger.log(`[${name}] 시작`);
    try {
      const result = await job();
      this.logger.log(
        `[${name}] 완료 ${Date.now() - startedAt}ms ${JSON.stringify(result)}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `[${name}] 실패 ${Date.now() - startedAt}ms: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return false;
    }
  }
}

const daysBefore = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
};
