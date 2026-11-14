import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import {
  Currency,
  DailyExchangeRate,
  DailySecurity,
  PurchaseDateBalance,
  Security,
  truncateByCurrency,
} from '@app/common';
import type { AuthUser } from '../auth/jwt.strategy.js';
import { DividendHistoryService } from './dividend-history.service.js';
import type {
  DividendSumItemDto,
  EvaluationItemDto,
  PeriodReturnResponse,
  TotalReturnItemDto,
} from './period-return.dto.js';
import type { PeriodReturnRequest } from './period-return.schema.js';
import { returnRate } from './return-rate.js';

@Injectable()
export class PeriodReturnService {
  constructor(
    @InjectRepository(PurchaseDateBalance)
    private readonly purchaseDateBalanceRepository: Repository<PurchaseDateBalance>,
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    @InjectRepository(DailySecurity)
    private readonly dailySecurityRepository: Repository<DailySecurity>,
    @InjectRepository(DailyExchangeRate)
    private readonly dailyExchangeRateRepository: Repository<DailyExchangeRate>,
    private readonly dividendHistoryService: DividendHistoryService,
  ) {}

  /**
   * 기간 총수익률.
   * 1. 종료일 보유분(매수일 <= to, 미매도 또는 매도일 > to)으로 종목별 수량·원금
   *    - USD 원화 원금은 매수분마다 저장된 구매 환율, 없으면 매수일(이전 최근) USD 환율로 환산
   * 2. 평가금액 = 종료일(이전 최근) 종가 × 수량, USD는 종료일(이전 최근) 환율로 원화 환산
   * 3. 기간 배당금 = DividendHistoryService 결과(지급일이 [from, to])를 종목별로 합산
   * 4. 종목 = 종료일 보유 종목 ∪ 기간 중 배당 받은 종목. 총합 = 평가금액 + 배당금, 원금 대비 수익금·수익률
   * 합계는 응답에 보이는 종목별 값(버림 후)을 더한다.
   * securityCompany를 주면 그 증권사 매수분만으로 원금·평가·배당을 계산, 없으면 전체 증권사.
   */
  async getPeriodReturn(
    authUser: AuthUser,
    input: PeriodReturnRequest,
  ): Promise<PeriodReturnResponse> {
    const { from, to, securityCompany } = input;
    const companyFilter = securityCompany ? { securityCompany } : {};

    // 1. 종료일 보유분 (증권사를 주면 그 증권사 매수분만)
    const purchases = await this.purchaseDateBalanceRepository.find({
      where: { userId: authUser.id, ...companyFilter },
    });
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

    // 3. 기간 배당금 (증권사를 주면 그 증권사 보유 수량 기준)
    const history = await this.dividendHistoryService.getDividendHistory(
      authUser,
      { from, to, ...companyFilter },
    );
    const dividends = new Map<string, { usd: Decimal; krw: Decimal }>();
    for (const item of history.months.flatMap((month) => month.items)) {
      const sum = dividends.get(item.securityId) ?? {
        usd: new Decimal(0),
        krw: new Decimal(0),
      };
      if (item.usdAmount !== null) {
        sum.usd = sum.usd.plus(item.usdAmount);
      }
      if (item.krwAmount !== null) {
        sum.krw = sum.krw.plus(item.krwAmount);
      }
      dividends.set(item.securityId, sum);
    }

    // 4. 대상 종목
    const ids = [...new Set([...heldBySecurity.keys(), ...dividends.keys()])];
    const securities = ids.length
      ? await this.securityRepository.findBy({ id: In(ids) })
      : [];
    const targets = securities
      .filter((s) => s.currency === Currency.KRW || s.currency === Currency.USD)
      .sort((a, b) => a.id.localeCompare(b.id));

    const hasUsd = targets.some(
      (s) => s.currency === Currency.USD && heldBySecurity.has(s.id),
    );
    const rateCache = new Map<string, DailyExchangeRate | null>();
    const endRate = hasUsd ? await this.findUsdRate(to, rateCache) : null;
    if (hasUsd && !endRate) {
      throw new NotFoundException('종료일 이전의 USD 환율 정보가 없습니다.');
    }

    // 1~2. 평가
    const evaluationItems: EvaluationItemDto[] = [];
    for (const security of targets) {
      evaluationItems.push(
        await this.evaluate(
          security,
          heldBySecurity.get(security.id) ?? [],
          to,
          endRate,
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
      };
    });

    const totalItems: TotalReturnItemDto[] = evaluationItems.map((e, i) => {
      const dividendAmount = dividendItems[i].krwAmount;
      const totalAmount = new Decimal(e.krwEvaluationAmount).plus(dividendAmount);
      return {
        securityId: e.securityId,
        name: e.name,
        purchaseAmount: e.krwPurchaseAmount,
        evaluationAmount: e.krwEvaluationAmount,
        dividendAmount,
        totalAmount: toKrw(totalAmount),
        profit: toKrw(totalAmount.minus(e.krwPurchaseAmount)),
        returnRate: returnRate(e.krwPurchaseAmount, totalAmount),
      };
    });

    // 합계
    const purchaseSum = sum(evaluationItems.map((e) => e.krwPurchaseAmount));
    const evaluationSum = sum(evaluationItems.map((e) => e.krwEvaluationAmount));
    const dividendKrwSum = sum(dividendItems.map((d) => d.krwAmount));
    const totalSum = evaluationSum.plus(dividendKrwSum);

    return {
      from,
      to,
      exchangeRate: endRate ? new Decimal(endRate.closingRate).toString() : null,
      exchangeRateDate: endRate?.date ?? null,
      evaluation: {
        items: evaluationItems,
        total: {
          purchaseAmount: toKrw(purchaseSum),
          evaluationAmount: toKrw(evaluationSum),
          profit: toKrw(evaluationSum.minus(purchaseSum)),
          returnRate: returnRate(purchaseSum, evaluationSum),
        },
      },
      dividend: {
        items: dividendItems,
        total: {
          usdAmount: toUsd(sum(dividendItems.map((d) => d.usdAmount))),
          krwAmount: toKrw(dividendKrwSum),
        },
      },
      total: {
        items: totalItems,
        total: {
          purchaseAmount: toKrw(purchaseSum),
          evaluationAmount: toKrw(evaluationSum),
          dividendAmount: toKrw(dividendKrwSum),
          totalAmount: toKrw(totalSum),
          profit: toKrw(totalSum.minus(purchaseSum)),
          returnRate: returnRate(purchaseSum, totalSum),
        },
      },
    };
  }

  /** 종목 하나의 종료일 보유 수량·원금·평가금액. 보유 수량이 0이면 원금·평가 0 */
  private async evaluate(
    security: Security,
    held: PurchaseDateBalance[],
    to: string,
    endRate: DailyExchangeRate | null,
    rateCache: Map<string, DailyExchangeRate | null>,
  ): Promise<EvaluationItemDto> {
    const { currency } = security;
    const isUsd = currency === Currency.USD;
    let quantity = new Decimal(0);
    let cost = new Decimal(0);
    let krwCost = new Decimal(0);
    for (const purchase of held) {
      const purchaseCost = new Decimal(purchase.amount).times(purchase.price);
      quantity = quantity.plus(purchase.amount);
      cost = cost.plus(purchaseCost);
      if (isUsd) {
        // 저장된 구매 환율 우선, 없으면 매수일(이전 최근) USD 환율
        let rate = purchase.exchangeRate;
        if (rate == null) {
          const daily = await this.findUsdRate(purchase.purchaseDate, rateCache);
          if (!daily) {
            throw new NotFoundException(
              `${purchase.purchaseDate} 이전의 USD 환율 정보가 없습니다.`,
            );
          }
          rate = daily.closingRate;
        }
        krwCost = krwCost.plus(purchaseCost.times(rate));
      }
    }
    if (!isUsd) {
      krwCost = cost;
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
        closingPrice: null,
        priceDate: null,
        usdPurchaseAmount: isUsd ? toUsd(0) : null,
        usdEvaluationAmount: isUsd ? toUsd(0) : null,
        krwPurchaseAmount: '0',
        krwEvaluationAmount: '0',
        profit: '0',
        returnRate: '0.00',
      };
    }

    const daily = await this.dailySecurityRepository.findOne({
      where: { id: security.id, date: LessThanOrEqual(to) },
      order: { date: 'DESC' },
    });
    if (!daily) {
      throw new NotFoundException(`${security.name}의 ${to} 이전 시세가 없습니다.`);
    }
    const evaluation = new Decimal(daily.closingPrice).times(quantity);
    const krwEvaluation = isUsd
      ? evaluation.times(endRate!.closingRate)
      : evaluation;
    const krwPurchaseAmount = toKrw(krwCost);
    const krwEvaluationAmount = toKrw(krwEvaluation);
    return {
      ...base,
      closingPrice: truncateByCurrency(daily.closingPrice, currency),
      priceDate: daily.date,
      usdPurchaseAmount: isUsd ? toUsd(cost) : null,
      usdEvaluationAmount: isUsd ? toUsd(evaluation) : null,
      krwPurchaseAmount,
      krwEvaluationAmount,
      profit: toKrw(new Decimal(krwEvaluationAmount).minus(krwPurchaseAmount)),
      returnRate: returnRate(krwPurchaseAmount, krwEvaluationAmount),
    };
  }

  /** date(포함) 이전 가장 최근 USD 환율. 날짜별로 한 번만 조회 */
  private async findUsdRate(
    date: string,
    cache: Map<string, DailyExchangeRate | null>,
  ): Promise<DailyExchangeRate | null> {
    if (!cache.has(date)) {
      const rate = await this.dailyExchangeRateRepository.findOne({
        where: { currency: Currency.USD, date: LessThanOrEqual(date) },
        order: { date: 'DESC' },
      });
      cache.set(date, rate);
    }
    return cache.get(date) ?? null;
  }
}

const sum = (values: (string | null)[]): Decimal =>
  values.reduce<Decimal>(
    (acc, value) => (value === null ? acc : acc.plus(value)),
    new Decimal(0),
  );

const toKrw = (value: Decimal.Value): string =>
  truncateByCurrency(value, Currency.KRW);
const toUsd = (value: Decimal.Value): string =>
  truncateByCurrency(value, Currency.USD);
