import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { Between, In, LessThanOrEqual, Repository } from 'typeorm';
import {
  Currency,
  type DailyExchangeRate,
  Dividend,
  DividendType,
  type PurchaseDateBalance,
  Security,
  truncateByCurrency,
} from '@app/common';
import type { AuthUser } from '../../auth/restapi/jwt.strategy.js';
import { DailyPriceReader } from '../../security/daily-price.reader.js';
import { ExchangeRateReader } from '../../security/exchange-rate.reader.js';
import { addDays, addYears, todayInSeoul } from '../../security/iso-date.js';
import { SecurityRefresher } from '../../security/security.refresher.js';
import { PurchaseRateReader } from '../purchase-rate.reader.js';
import { PurchaseReader } from '../purchase.reader.js';
import { percentOf } from '../return-rate.js';
import type {
  DividendMetricsItemDto,
  DividendMetricsResponse,
  GrowthBasis,
} from './dto/dividend-metrics.dto.js';
import type { DividendMetricsRequest } from './dto/dividend-metrics.schema.js';

@Injectable()
export class DividendMetricsService {
  constructor(
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    @InjectRepository(Dividend)
    private readonly dividendRepository: Repository<Dividend>,
    private readonly purchaseReader: PurchaseReader,
    private readonly purchaseRateReader: PurchaseRateReader,
    private readonly dailyPriceReader: DailyPriceReader,
    private readonly exchangeRateReader: ExchangeRateReader,
    private readonly securityRefresher: SecurityRefresher,
  ) {}

  /**
   * 현재 보유 종목의 배당 지표 (세전).
   * 1. 미매도 매수분으로 종목별 수량·원금 (USD 원금은 매수분마다 구매 환율, 계좌를 주면 그 계좌만)
   * 2. 종목마다 배당·시세를 원천에서 갱신 (DividendHistoryCalculator와 같은 SecurityRefresher, 하루 한 번)
   * 3. 지급일 기준 최근 12개월(오늘−1년 초과 ~ 오늘)과 그 직전 12개월의 주당 현금배당 합
   * 4. 예상 연배당 = 최근 12개월 주당 배당 × 현재 수량, USD는 최신 환율로 원화 환산
   * 5. YOC = 원화 예상 연배당 ÷ 원화 원금, 현재 배당률 = 최근 12개월 주당 배당 ÷ 최신 종가,
   *    성장률 = 최근 12개월 ÷ 직전 12개월 − 1 (직전이 0이면 null). 다만 KRW 종목의 첫 현금배당이 직전 12개월 안이고
   *    (상장 1년 남짓) 직전 지급 횟수가 최근보다 적으면, 합은 횟수 차이만큼 부풀려지므로 회당 평균끼리 비교한다
   * 합계는 종목별 값(버림 후)을 더한다.
   */
  async getDividendMetrics(
    authUser: AuthUser,
    input: DividendMetricsRequest,
  ): Promise<DividendMetricsResponse> {
    const today = todayInSeoul();
    const trailingFrom = addYears(today, -1);
    const previousFrom = addYears(today, -2);

    // 1. 현재 보유분
    const held = (
      await this.purchaseReader.findByUser(authUser.id, input.accountId)
    ).filter((p) => p.saleDate === null && p.purchaseDate <= today);
    const heldBySecurity = new Map<string, PurchaseDateBalance[]>();
    for (const purchase of held) {
      const list = heldBySecurity.get(purchase.securityId) ?? [];
      list.push(purchase);
      heldBySecurity.set(purchase.securityId, list);
    }
    const ids = [...heldBySecurity.keys()];
    const securities = ids.length
      ? (await this.securityRepository.findBy({ id: In(ids) }))
          .filter((s) => s.currency === Currency.KRW || s.currency === Currency.USD)
          .sort((a, b) => a.id.localeCompare(b.id))
      : [];

    // 2. 온라인 갱신 (외부 API 한도 때문에 순서대로)
    for (const security of securities) {
      await this.securityRefresher.refresh(security);
    }

    // 3. 최근 24개월 지급 현금배당
    const dividends = securities.length
      ? await this.dividendRepository.find({
          where: {
            id: In(securities.map((s) => s.id)),
            type: DividendType.MONEY,
            paymentDate: Between(addDays(previousFrom, 1), today),
          },
          order: { paymentDate: 'ASC', id: 'ASC' },
        })
      : [];

    const hasUsd = securities.some((s) => s.currency === Currency.USD);
    const endRate = hasUsd
      ? await this.exchangeRateReader.findUsdOnOrBefore(today)
      : null;
    if (hasUsd && !endRate) {
      throw new NotFoundException('오늘 이전의 USD 환율 정보가 없습니다.');
    }

    const rateCache = new Map<string, DailyExchangeRate | null>();
    const items: DividendMetricsItemDto[] = [];
    for (const security of securities) {
      items.push(
        await this.evaluate(
          security,
          heldBySecurity.get(security.id) ?? [],
          dividends.filter((d) => d.id === security.id),
          { today, trailingFrom, previousFrom, endRate, rateCache },
        ),
      );
    }

    const annualSum = sum(items.map((i) => i.krwAnnualDividend));
    const purchaseSum = sum(items.map((i) => i.krwPurchaseAmount));
    const priced = items.filter((i) => i.krwEvaluationAmount !== null);
    const evaluationSum = sum(priced.map((i) => i.krwEvaluationAmount!));
    const pricedAnnualSum = sum(priced.map((i) => i.krwAnnualDividend));

    return {
      date: today,
      exchangeRate: endRate ? new Decimal(endRate.closingRate).toString() : null,
      exchangeRateDate: endRate?.date ?? null,
      items,
      total: {
        krwAnnualDividend: toKrw(annualSum),
        krwPurchaseAmount: toKrw(purchaseSum),
        krwEvaluationAmount: toKrw(evaluationSum),
        yieldOnCost: percentOf(annualSum, purchaseSum),
        currentYield: percentOf(pricedAnnualSum, evaluationSum),
      },
    };
  }

  /**
   * 배당 성장률(%). 보통은 최근 12개월 합 ÷ 직전 12개월 합 − 1 (연배당 증감, 분기→월배당 전환도 반영).
   * KRW 종목이고 직전 지급 횟수가 최근보다 적고 첫 현금배당이 직전 12개월 안이면(previousFrom 이전 지급이 없으면)
   * 상장 1년 남짓이라 직전 기간이 덜 찬 것이므로 회당 평균끼리 비교한다 (횟수가 같으면 두 방식은 같다). 직전 배당이 0이면 null.
   * USD는 항상 합끼리: 배당이 최근 2년치만 저장돼 상장 시점을 알 수 없고, 오래된 종목이 분기→월배당으로 바뀌면
   * 회당 평균 비교가 큰 마이너스로 잘못 나온다.
   */
  private async growthRate(
    security: Security,
    previousFrom: string,
    { trailing, paymentCount, previous, previousPaymentCount }: {
      trailing: Decimal;
      paymentCount: number;
      previous: Decimal;
      previousPaymentCount: number;
    },
  ): Promise<{ rate: string | null; basis: GrowthBasis }> {
    if (previous.isZero()) return { rate: null, basis: 'TOTAL' };
    const partialPrevious =
      security.currency === Currency.KRW &&
      previousPaymentCount > 0 &&
      previousPaymentCount < paymentCount &&
      !(await this.dividendRepository.existsBy({
        id: security.id,
        type: DividendType.MONEY,
        paymentDate: LessThanOrEqual(previousFrom),
      }));
    if (!partialPrevious) {
      return { rate: percentOf(trailing.minus(previous), previous), basis: 'TOTAL' };
    }
    const trailingAverage = trailing.dividedBy(paymentCount);
    const previousAverage = previous.dividedBy(previousPaymentCount);
    return {
      rate: percentOf(trailingAverage.minus(previousAverage), previousAverage),
      basis: 'PER_PAYMENT',
    };
  }

  /** 종목 하나의 지표 */
  private async evaluate(
    security: Security,
    held: PurchaseDateBalance[],
    dividends: Dividend[],
    context: {
      today: string;
      trailingFrom: string;
      previousFrom: string;
      endRate: DailyExchangeRate | null;
      rateCache: Map<string, DailyExchangeRate | null>;
    },
  ): Promise<DividendMetricsItemDto> {
    const { currency } = security;
    const isUsd = currency === Currency.USD;

    let quantity = new Decimal(0);
    let krwCost = new Decimal(0);
    for (const purchase of held) {
      const cost = new Decimal(purchase.amount).times(purchase.price);
      quantity = quantity.plus(purchase.amount);
      krwCost = krwCost.plus(
        isUsd
          ? cost.times(
              await this.purchaseRateReader.getRate(purchase, context.rateCache),
            )
          : cost,
      );
    }

    let trailing = new Decimal(0);
    let previous = new Decimal(0);
    let paymentCount = 0;
    let previousPaymentCount = 0;
    for (const dividend of dividends) {
      if (dividend.paymentDate > context.trailingFrom) {
        trailing = trailing.plus(dividend.amount);
        paymentCount += 1;
      } else {
        previous = previous.plus(dividend.amount);
        previousPaymentCount += 1;
      }
    }
    const growth = await this.growthRate(security, context.previousFrom, {
      trailing,
      paymentCount,
      previous,
      previousPaymentCount,
    });

    const annual = new Decimal(truncateByCurrency(trailing.times(quantity), currency));
    const krwAnnual = toKrw(
      isUsd ? annual.times(context.endRate!.closingRate) : annual,
    );
    const krwPurchaseAmount = toKrw(krwCost);

    const daily = await this.dailyPriceReader.findLatestOnOrBefore(
      security.id,
      context.today,
    );
    const krwEvaluation = daily
      ? toKrw(
          new Decimal(daily.closingPrice)
            .times(quantity)
            .times(isUsd ? context.endRate!.closingRate : 1),
        )
      : null;

    return {
      securityId: security.id,
      symbol: security.symbol,
      name: security.name,
      currency,
      quantity: truncateByCurrency(quantity, currency),
      trailingPerShare: truncateByCurrency(trailing, currency),
      paymentCount,
      previousPerShare: truncateByCurrency(previous, currency),
      previousPaymentCount,
      growthRate: growth.rate,
      growthBasis: growth.basis,
      annualDividend: truncateByCurrency(annual, currency),
      krwAnnualDividend: krwAnnual,
      krwPurchaseAmount,
      closingPrice: daily ? truncateByCurrency(daily.closingPrice, currency) : null,
      priceDate: daily?.date ?? null,
      krwEvaluationAmount: krwEvaluation,
      yieldOnCost: percentOf(krwAnnual, krwPurchaseAmount),
      currentYield: daily ? percentOf(trailing, daily.closingPrice) : null,
    };
  }
}

const sum = (values: string[]): Decimal =>
  values.reduce((acc, value) => acc.plus(value), new Decimal(0));

const toKrw = (value: Decimal.Value): string =>
  truncateByCurrency(value, Currency.KRW);
