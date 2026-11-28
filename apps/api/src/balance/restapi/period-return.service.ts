import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { In, Repository } from 'typeorm';
import {
  Currency,
  type DailyExchangeRate,
  isSupportedCurrency,
  type PurchaseDateBalance,
  Security,
  toKrw,
  toUsd,
  truncateByCurrency,
} from '@app/common';
import { sumDecimals } from '../money.js';
import type { AuthUser } from '../../auth/restapi/jwt.strategy.js';
import { DailyPriceReader } from '../../security/daily-price.reader.js';
import { priceLookupDate } from '../../security/price-date.js';
import { ExchangeRateReader } from '../../security/exchange-rate.reader.js';
import { DividendHistoryCalculator } from '../dividend-history.calculator.js';
import type {
  DividendSumItemDto,
  EvaluationItemDto,
  PeriodReturnResponse,
  TotalReturnItemDto,
} from './dto/period-return.dto.js';
import type { PeriodReturnRequest } from './dto/period-return.schema.js';
import { PurchaseRateReader } from '../purchase-rate.reader.js';
import { PurchaseReader } from '../purchase.reader.js';
import { returnRate } from '../return-rate.js';

@Injectable()
export class PeriodReturnService {
  constructor(
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    private readonly purchaseReader: PurchaseReader,
    private readonly purchaseRateReader: PurchaseRateReader,
    private readonly dailyPriceReader: DailyPriceReader,
    private readonly exchangeRateReader: ExchangeRateReader,
    private readonly dividendHistoryCalculator: DividendHistoryCalculator,
  ) {}

  /**
   * 기간 총수익률.
   * 1. 종료일 보유분(매수일 <= to, 미매도 또는 매도일 > to)으로 종목별 수량·원금
   *    - USD 원화 원금은 매수분마다 저장된 구매 환율, 없으면 매수일(이전 최근) USD 환율로 환산
   * 2. 평가금액 = 종료일(이전 최근) 종가 × 수량, USD는 종료일(이전 최근) 환율로 원화 환산
   *    - 기준금액: 시작일 전 매수분은 시작일(이전 최근) 종가 × 수량(USD는 시작일 환율), 기간 중 매수분은 원금
   *    - KRW 종가는 krwPriceDate()까지만 본다(15:30 전이면 오늘 시세 대신 전날 종가)
   *    - USD 종가는 하루 전 날짜까지 본다(시세는 미국 거래일 날짜로 저장되고 한국 다음 날 새벽에 마감)
   * 3. 기간 배당금 = DividendHistoryCalculator 결과(지급일이 [from, to])를 종목별로 합산
   * 4. 종목 = 종료일 보유 종목 ∪ 기간 중 배당 받은 종목. 총합 = 평가금액 + 배당금, 기준금액 대비 수익금·수익률
   * 합계는 응답에 보이는 종목별 값(버림 후)을 더한다.
   * accountId를 주면 그 계좌 매수분만으로 원금·평가·배당을 계산, 없으면 전체 계좌.
   */
  async getPeriodReturn(
    authUser: AuthUser,
    input: PeriodReturnRequest,
  ): Promise<PeriodReturnResponse> {
    const { from, to, accountId } = input;

    // 1. 종료일 보유분 (계좌를 주면 그 계좌 매수분만)
    const purchases = await this.purchaseReader.findByUser(
      authUser.id,
      accountId,
    );
    const heldBySecurity = new Map<string, PurchaseDateBalance[]>();
    for (const purchase of purchases) {
      if (
        purchase.purchaseDate > to ||
        (purchase.saleDate !== null && purchase.saleDate <= to)
      ) {
        continue;
      }
      const list = heldBySecurity.get(purchase.securityId) ?? [];
      list.push(purchase);
      heldBySecurity.set(purchase.securityId, list);
    }

    // 3. 기간 배당금 (계좌를 주면 그 계좌 보유 수량 기준)
    const history = await this.dividendHistoryCalculator.calculate(
      authUser,
      { from, to, accountId },
    );
    const dividends = new Map<
      string,
      { usd: Decimal; krw: Decimal; afterTaxUsd: Decimal; afterTaxKrw: Decimal }
    >();
    for (const item of history.months.flatMap((month) => month.items)) {
      const sum = dividends.get(item.securityId) ?? {
        usd: new Decimal(0),
        krw: new Decimal(0),
        afterTaxUsd: new Decimal(0),
        afterTaxKrw: new Decimal(0),
      };
      if (item.usdAmount !== null) {
        sum.usd = sum.usd.plus(item.usdAmount);
      }
      if (item.krwAmount !== null) {
        sum.krw = sum.krw.plus(item.krwAmount);
      }
      if (item.afterTaxUsdAmount !== null) {
        sum.afterTaxUsd = sum.afterTaxUsd.plus(item.afterTaxUsdAmount);
      }
      if (item.afterTaxKrwAmount !== null) {
        sum.afterTaxKrw = sum.afterTaxKrw.plus(item.afterTaxKrwAmount);
      }
      dividends.set(item.securityId, sum);
    }

    // 4. 대상 종목
    const ids = [...new Set([...heldBySecurity.keys(), ...dividends.keys()])];
    const securities = ids.length
      ? await this.securityRepository.findBy({ id: In(ids) })
      : [];
    const targets = securities
      .filter((s) => isSupportedCurrency(s.currency))
      .sort((a, b) => a.id.localeCompare(b.id));

    const hasUsd = targets.some(
      (s) => s.currency === Currency.USD && heldBySecurity.has(s.id),
    );
    const rateCache = new Map<string, DailyExchangeRate | null>();
    const endRate = hasUsd
      ? await this.exchangeRateReader.findUsdOnOrBefore(to, rateCache)
      : null;
    if (hasUsd && !endRate) {
      throw new NotFoundException('종료일 이전의 USD 환율 정보가 없습니다.');
    }

    // 시작일 전 매수한 USD 보유분이 있으면 시작일(이전 최근) 환율. 없으면 그 매수분은 원금 기준
    const hasUsdBeforeFrom = targets.some(
      (s) =>
        s.currency === Currency.USD &&
        (heldBySecurity.get(s.id) ?? []).some((p) => p.purchaseDate < from),
    );
    const startRate = hasUsdBeforeFrom
      ? await this.exchangeRateReader.findUsdOnOrBefore(from, rateCache)
      : null;

    // 1~2. 평가
    const evaluationItems: EvaluationItemDto[] = [];
    for (const security of targets) {
      evaluationItems.push(
        await this.evaluate(
          security,
          heldBySecurity.get(security.id) ?? [],
          { from, to },
          endRate,
          startRate,
          rateCache,
        ),
      );
    }

    const dividendItems: DividendSumItemDto[] = targets.map((security) => {
      const sum = dividends.get(security.id);
      return {
        securityId: security.id,
        name: security.name,
        currency: security.currency,
        usdAmount:
          security.currency === Currency.USD ? toUsd(sum?.usd ?? 0) : null,
        krwAmount: toKrw(sum?.krw ?? 0),
        afterTaxUsdAmount:
          security.currency === Currency.USD
            ? toUsd(sum?.afterTaxUsd ?? 0)
            : null,
        afterTaxKrwAmount: toKrw(sum?.afterTaxKrw ?? 0),
      };
    });

    const totalItems: TotalReturnItemDto[] = evaluationItems.map((e, i) => {
      const dividendAmount = dividendItems[i].krwAmount;
      const totalAmount = new Decimal(e.krwEvaluationAmount).plus(dividendAmount);
      const afterTaxDividendAmount = dividendItems[i].afterTaxKrwAmount;
      const afterTaxTotalAmount = new Decimal(e.krwEvaluationAmount).plus(
        afterTaxDividendAmount,
      );
      const base = e.krwBaseAmount;
      return {
        securityId: e.securityId,
        name: e.name,
        purchaseAmount: e.krwPurchaseAmount,
        baseAmount: base,
        evaluationAmount: e.krwEvaluationAmount,
        dividendAmount,
        totalAmount: toKrw(totalAmount),
        profit: toKrw(totalAmount.minus(base)),
        returnRate: returnRate(base, totalAmount),
        afterTaxDividendAmount,
        afterTaxTotalAmount: toKrw(afterTaxTotalAmount),
        afterTaxProfit: toKrw(afterTaxTotalAmount.minus(base)),
        afterTaxReturnRate: returnRate(base, afterTaxTotalAmount),
      };
    });

    // 합계
    const purchaseSum = sumDecimals(evaluationItems.map((e) => e.krwPurchaseAmount));
    const baseSum = sumDecimals(evaluationItems.map((e) => e.krwBaseAmount));
    const evaluationSum = sumDecimals(evaluationItems.map((e) => e.krwEvaluationAmount));
    const dividendKrwSum = sumDecimals(dividendItems.map((d) => d.krwAmount));
    const totalSum = evaluationSum.plus(dividendKrwSum);
    const afterTaxDividendKrwSum = sumDecimals(
      dividendItems.map((d) => d.afterTaxKrwAmount),
    );
    const afterTaxTotalSum = evaluationSum.plus(afterTaxDividendKrwSum);

    return {
      from,
      to,
      exchangeRate: endRate ? new Decimal(endRate.closingRate).toString() : null,
      exchangeRateDate: endRate?.date ?? null,
      startExchangeRate: startRate
        ? new Decimal(startRate.closingRate).toString()
        : null,
      startExchangeRateDate: startRate?.date ?? null,
      evaluation: {
        items: evaluationItems,
        total: {
          purchaseAmount: toKrw(purchaseSum),
          baseAmount: toKrw(baseSum),
          evaluationAmount: toKrw(evaluationSum),
          profit: toKrw(evaluationSum.minus(baseSum)),
          returnRate: returnRate(baseSum, evaluationSum),
        },
      },
      dividend: {
        items: dividendItems,
        total: {
          usdAmount: toUsd(sumDecimals(dividendItems.map((d) => d.usdAmount))),
          krwAmount: toKrw(dividendKrwSum),
          afterTaxUsdAmount: toUsd(
            sumDecimals(dividendItems.map((d) => d.afterTaxUsdAmount)),
          ),
          afterTaxKrwAmount: toKrw(afterTaxDividendKrwSum),
        },
      },
      total: {
        items: totalItems,
        total: {
          purchaseAmount: toKrw(purchaseSum),
          baseAmount: toKrw(baseSum),
          evaluationAmount: toKrw(evaluationSum),
          dividendAmount: toKrw(dividendKrwSum),
          totalAmount: toKrw(totalSum),
          profit: toKrw(totalSum.minus(baseSum)),
          returnRate: returnRate(baseSum, totalSum),
          afterTaxDividendAmount: toKrw(afterTaxDividendKrwSum),
          afterTaxTotalAmount: toKrw(afterTaxTotalSum),
          afterTaxProfit: toKrw(afterTaxTotalSum.minus(baseSum)),
          afterTaxReturnRate: returnRate(baseSum, afterTaxTotalSum),
        },
      },
    };
  }

  /**
   * 종목 하나의 종료일 보유 수량·원금·기준금액·평가금액. 보유 수량이 0이면 모두 0.
   * 기준금액: 시작일 전 매수분은 시작일(이전 최근) 종가 × 수량(USD는 시작일 환율),
   * 그 종가·환율이 없거나 종가가 매수일보다 앞서면(시세 누락) 원금. 기간 중 매수분은 원금.
   */
  private async evaluate(
    security: Security,
    held: PurchaseDateBalance[],
    period: { from: string; to: string },
    endRate: DailyExchangeRate | null,
    startRate: DailyExchangeRate | null,
    rateCache: Map<string, DailyExchangeRate | null>,
  ): Promise<EvaluationItemDto> {
    const { currency } = security;
    const isUsd = currency === Currency.USD;
    // KRW는 장 마감(15:30) 전이면 전날까지, USD는 하루 전(미국 거래일)까지의 종가
    const priceDateOf = (date: string): string => priceLookupDate(currency, date);

    const startDaily = held.some((p) => p.purchaseDate < period.from)
      ? await this.dailyPriceReader.findLatestOnOrBefore(
          security.id,
          priceDateOf(period.from),
        )
      : null;

    let quantity = new Decimal(0);
    let cost = new Decimal(0);
    let krwCost = new Decimal(0);
    let baseCost = new Decimal(0);
    let krwBase = new Decimal(0);
    let startUsed = false;
    for (const purchase of held) {
      const purchaseCost = new Decimal(purchase.amount).times(purchase.price);
      const krwPurchaseCost = isUsd
        ? purchaseCost.times(
            await this.purchaseRateReader.getRate(purchase, rateCache),
          )
        : purchaseCost;
      quantity = quantity.plus(purchase.amount);
      cost = cost.plus(purchaseCost);
      krwCost = krwCost.plus(krwPurchaseCost);

      if (
        purchase.purchaseDate < period.from &&
        startDaily !== null &&
        startDaily.date >= purchase.purchaseDate &&
        (!isUsd || startRate !== null)
      ) {
        const startValue = new Decimal(purchase.amount).times(
          startDaily.closingPrice,
        );
        baseCost = baseCost.plus(startValue);
        krwBase = krwBase.plus(
          isUsd ? startValue.times(startRate!.closingRate) : startValue,
        );
        startUsed = true;
      } else {
        baseCost = baseCost.plus(purchaseCost);
        krwBase = krwBase.plus(krwPurchaseCost);
      }
    }

    const base = {
      securityId: security.id,
      name: security.name,
      currency,
      quantity: truncateByCurrency(quantity, currency),
    };
    if (quantity.isZero()) {
      return {
        ...base,
        startClosingPrice: null,
        startPriceDate: null,
        closingPrice: null,
        priceDate: null,
        usdPurchaseAmount: isUsd ? toUsd(0) : null,
        usdBaseAmount: isUsd ? toUsd(0) : null,
        usdEvaluationAmount: isUsd ? toUsd(0) : null,
        krwPurchaseAmount: '0',
        krwBaseAmount: '0',
        krwEvaluationAmount: '0',
        profit: '0',
        returnRate: '0.00',
      };
    }

    const daily = await this.dailyPriceReader.findLatestOnOrBefore(
      security.id,
      priceDateOf(period.to),
    );
    if (!daily) {
      throw new NotFoundException(
        `${security.name}의 ${period.to} 이전 시세가 없습니다.`,
      );
    }
    const evaluation = new Decimal(daily.closingPrice).times(quantity);
    const krwEvaluation = isUsd
      ? evaluation.times(endRate!.closingRate)
      : evaluation;
    const krwBaseAmount = toKrw(krwBase);
    const krwEvaluationAmount = toKrw(krwEvaluation);
    return {
      ...base,
      startClosingPrice:
        startUsed && startDaily
          ? truncateByCurrency(startDaily.closingPrice, currency)
          : null,
      startPriceDate: startUsed && startDaily ? startDaily.date : null,
      closingPrice: truncateByCurrency(daily.closingPrice, currency),
      priceDate: daily.date,
      usdPurchaseAmount: isUsd ? toUsd(cost) : null,
      usdBaseAmount: isUsd ? toUsd(baseCost) : null,
      usdEvaluationAmount: isUsd ? toUsd(evaluation) : null,
      krwPurchaseAmount: toKrw(krwCost),
      krwBaseAmount,
      krwEvaluationAmount,
      profit: toKrw(new Decimal(krwEvaluationAmount).minus(krwBaseAmount)),
      returnRate: returnRate(krwBaseAmount, krwEvaluationAmount),
    };
  }
}

