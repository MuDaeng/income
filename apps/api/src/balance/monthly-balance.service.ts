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
import { todayInSeoul } from '../security/iso-date.js';
import { DividendHistoryService } from './dividend-history.service.js';
import type {
  MonthlyBalanceItemDto,
  MonthlyBalanceMonthDto,
  MonthlyBalanceResponse,
} from './monthly-balance.dto.js';
import type { MonthlyBalanceRequest } from './monthly-balance.schema.js';

/** 날짜 오름차순 행 목록에서 date(포함) 이전 가장 최근 행을 찾기 위한 최소 형태 */
interface Dated {
  date: string;
}

@Injectable()
export class MonthlyBalanceService {
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
   * 월말별 원금·평가금액·평가금액+누적배당금. 기준일 = 그 달 말일 (이번 달이면 오늘, Asia/Seoul).
   * securityCompany를 주면 그 증권사 매수분만으로 원금·평가·배당을 계산, 없으면 전체 증권사.
   * - 보유분: 매수일 <= 기준일, 미매도 또는 매도일 > 기준일. 원금은 USD면 저장된 구매 환율, 없으면 매수일(이전 최근) 환율로 환산
   * - 평가금액: 기준일(이전 최근) 종가 × 수량, USD는 기준일(이전 최근) 환율로 환산
   * - 누적배당금: 처음부터 기준일까지 지급된 배당금(DividendHistoryService, 원화 환산 없는 건 제외)
   * - 종목: 기준일 보유 종목 ∪ 기준일까지 배당을 받은 종목. 합계는 종목별 값(버림 후)을 더한다
   * 시세·환율은 마지막 기준일까지 한 번에 읽어 메모리에서 찾는다.
   */
  async getMonthlyBalance(
    authUser: AuthUser,
    input: MonthlyBalanceRequest,
  ): Promise<MonthlyBalanceResponse> {
    const { from, to, securityCompany } = input;
    const today = todayInSeoul();
    const months = monthsBetween(from, to).map((month) => {
      const end = endOfMonth(month);
      return { month, date: end < today ? end : today };
    });
    const lastDate = months[months.length - 1].date;

    const purchases = (
      await this.purchaseDateBalanceRepository.find({
        where: {
          userId: authUser.id,
          ...(securityCompany ? { securityCompany } : {}),
        },
      })
    ).filter((p) => p.purchaseDate <= lastDate);

    // 처음부터 마지막 기준일까지 지급된 배당금 (이 호출이 보유 종목을 온라인 갱신함).
    // 증권사를 주면 그 증권사 매수분의 보유 수량으로만 배당을 계산
    const history = await this.dividendHistoryService.getDividendHistory(
      authUser,
      { to: lastDate, ...(securityCompany ? { securityCompany } : {}) },
    );
    const dividends = history.months
      .flatMap((month) => month.items)
      .filter((item) => item.krwAmount !== null);

    const ids = [
      ...new Set([
        ...purchases.map((p) => p.securityId),
        ...dividends.map((d) => d.securityId),
      ]),
    ];
    const securities = ids.length
      ? (await this.securityRepository.findBy({ id: In(ids) }))
          .filter((s) => s.currency === Currency.KRW || s.currency === Currency.USD)
          .sort((a, b) => a.id.localeCompare(b.id))
      : [];

    const pricesById = new Map<string, DailySecurity[]>();
    if (securities.length) {
      const prices = await this.dailySecurityRepository.find({
        where: {
          id: In(securities.map((s) => s.id)),
          date: LessThanOrEqual(lastDate),
        },
        order: { date: 'ASC' },
      });
      for (const price of prices) {
        const list = pricesById.get(price.id) ?? [];
        list.push(price);
        pricesById.set(price.id, list);
      }
    }
    const rates = securities.some((s) => s.currency === Currency.USD)
      ? await this.dailyExchangeRateRepository.find({
          where: { currency: Currency.USD, date: LessThanOrEqual(lastDate) },
          order: { date: 'ASC' },
        })
      : [];

    // USD 매수분의 원화 원금은 기준일과 무관하므로 한 번만 계산
    const krwCostOf = new Map<PurchaseDateBalance, Decimal>();
    const securityById = new Map(securities.map((s) => [s.id, s]));
    for (const purchase of purchases) {
      const security = securityById.get(purchase.securityId);
      if (!security) {
        continue;
      }
      const cost = new Decimal(purchase.amount).times(purchase.price);
      if (security.currency === Currency.KRW) {
        krwCostOf.set(purchase, cost);
        continue;
      }
      const rate =
        purchase.exchangeRate ??
        latestOnOrBefore(rates, purchase.purchaseDate)?.closingRate;
      if (rate == null) {
        throw new NotFoundException(
          `${purchase.purchaseDate} 이전의 USD 환율 정보가 없습니다.`,
        );
      }
      krwCostOf.set(purchase, cost.times(rate));
    }

    const result: MonthlyBalanceMonthDto[] = months.map(({ month, date }) => {
      const items: MonthlyBalanceItemDto[] = [];
      for (const security of securities) {
        const held = purchases.filter(
          (p) =>
            p.securityId === security.id &&
            p.purchaseDate <= date &&
            (p.saleDate === null || p.saleDate > date),
        );
        const paid = dividends.filter(
          (d) => d.securityId === security.id && d.paymentDate <= date,
        );
        if (!held.length && !paid.length) {
          continue;
        }
        items.push(
          this.evaluate(security, held, paid.map((d) => d.krwAmount!), date, {
            krwCostOf,
            prices: pricesById.get(security.id) ?? [],
            rates,
          }),
        );
      }
      return { month, date, total: sumItems(items), items };
    });

    return { from, to, months: result };
  }

  /** 종목 하나의 기준일 값. 보유 수량이 0이면 원금·평가 0 */
  private evaluate(
    security: Security,
    held: PurchaseDateBalance[],
    paidKrw: string[],
    date: string,
    data: {
      krwCostOf: Map<PurchaseDateBalance, Decimal>;
      prices: DailySecurity[];
      rates: DailyExchangeRate[];
    },
  ): MonthlyBalanceItemDto {
    const { currency } = security;
    let quantity = new Decimal(0);
    let krwCost = new Decimal(0);
    for (const purchase of held) {
      quantity = quantity.plus(purchase.amount);
      krwCost = krwCost.plus(data.krwCostOf.get(purchase)!);
    }

    let krwEvaluation = new Decimal(0);
    if (!quantity.isZero()) {
      const price = latestOnOrBefore(data.prices, date);
      if (!price) {
        throw new NotFoundException(
          `${security.name}의 ${date} 이전 시세가 없습니다.`,
        );
      }
      krwEvaluation = new Decimal(price.closingPrice).times(quantity);
      if (currency === Currency.USD) {
        const rate = latestOnOrBefore(data.rates, date);
        if (!rate) {
          throw new NotFoundException(`${date} 이전의 USD 환율 정보가 없습니다.`);
        }
        krwEvaluation = krwEvaluation.times(rate.closingRate);
      }
    }

    const evaluationAmount = toKrw(krwEvaluation);
    const dividendAmount = toKrw(sum(paidKrw));
    return {
      securityId: security.id,
      name: security.name,
      currency,
      quantity: truncateByCurrency(quantity, currency),
      purchaseAmount: toKrw(krwCost),
      evaluationAmount,
      dividendAmount,
      totalAmount: toKrw(new Decimal(evaluationAmount).plus(dividendAmount)),
    };
  }
}

/** 'YYYY-MM' from~to (포함) */
const monthsBetween = (from: string, to: string): string[] => {
  const result: string[] = [];
  let [year, month] = from.split('-').map(Number);
  for (let ym = from; ym <= to; ) {
    result.push(ym);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    ym = `${year}-${String(month).padStart(2, '0')}`;
  }
  return result;
};

/** 'YYYY-MM'의 말일 'YYYY-MM-DD' */
const endOfMonth = (yearMonth: string): string => {
  const [year, month] = yearMonth.split('-').map(Number);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${yearMonth}-${String(day).padStart(2, '0')}`;
};

/** 날짜 오름차순 목록에서 date(포함) 이전 가장 최근 행 (이진 탐색) */
const latestOnOrBefore = <T extends Dated>(list: T[], date: string): T | null => {
  let lo = 0;
  let hi = list.length - 1;
  let found: T | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].date <= date) {
      found = list[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
};

const sum = (values: string[]): Decimal =>
  values.reduce((acc, value) => acc.plus(value), new Decimal(0));

const sumItems = (items: MonthlyBalanceItemDto[]) => ({
  purchaseAmount: toKrw(sum(items.map((i) => i.purchaseAmount))),
  evaluationAmount: toKrw(sum(items.map((i) => i.evaluationAmount))),
  dividendAmount: toKrw(sum(items.map((i) => i.dividendAmount))),
  totalAmount: toKrw(sum(items.map((i) => i.totalAmount))),
});

const toKrw = (value: Decimal.Value): string =>
  truncateByCurrency(value, Currency.KRW);
