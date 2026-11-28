import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import {
  Between,
  type FindOperator,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import {
  addYears,
  Currency,
  type DailyExchangeRate,
  Dividend,
  DividendType,
  isSupportedCurrency,
  type PurchaseDateBalance,
  Security,
  todayInSeoul,
  toKrw,
  toUsd,
  truncateByCurrency,
} from '@app/common';
import type { AuthUser } from '../auth/restapi/jwt.strategy.js';
import { ExchangeRateReader } from '../security/exchange-rate.reader.js';
import { SecurityRefresher } from '../security/security.refresher.js';
import { AccountReader } from '../user/account.reader.js';
import { dividendTax, isTaxedAccount } from './dividend-tax.js';
import type {
  DividendHistoryResponse,
  DividendItemDto,
  DividendSummaryDto,
} from './restapi/dto/dividend-history.dto.js';
import type { DividendHistoryRequest } from './restapi/dto/dividend-history.schema.js';
import { PurchaseReader } from './purchase.reader.js';

/**
 * 사용자의 배당금 내역 계산. GET /balance/dividends(DividendHistoryService)와
 * 기간 수익률·월별 잔고(PeriodReturnService, MonthlyBalanceService)가 함께 쓴다
 */
@Injectable()
export class DividendHistoryCalculator {
  constructor(
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    @InjectRepository(Dividend)
    private readonly dividendRepository: Repository<Dividend>,
    private readonly purchaseReader: PurchaseReader,
    private readonly exchangeRateReader: ExchangeRateReader,
    private readonly securityRefresher: SecurityRefresher,
    private readonly accountReader: AccountReader,
  ) {}

  /**
   * 배당금 내역.
   * 1. 사용자의 매수일별 잔고(매도분 포함)로 지금까지 보유한 종목을 구하고, 종목마다 배당·시세를 원천에서 갱신한다
   *    (종목별 하루 한 번, 실패해도 저장분으로 계속). 전량 매도하고 마지막 매도일이 1년보다 오래된 종목은
   *    갱신하지 않고 저장분만 쓴다 (needsRefresh)
   * 2. 그 종목들의 현금배당(MONEY) 중 지급일이 [from, to]인 것 (입력이 없으면 그쪽은 제한 없음, 지급 예정 포함)
   * 3. 배당마다 받을 권리가 있는 수량 = 배당락일 전날까지 매수하고 배당락일 이후(당일 포함) 매도했거나 보유 중인
   *    매수분 수량 합 (purchaseDate < 배당락일 <= saleDate). 배당락일이 없는 예전 행은 기준일 보유
   *    (purchaseDate <= 기준일 < saleDate)로 판정. 0이면 받지 않은 배당이라 제외
   * 4. 배당금 = 주당 배당금 × 보유 수량 (종목 통화로 버림). USD는 지급일(없으면 직전) USD 종가 환율로 원화 환산.
   *    세후 = 세전 − 세금. 세금은 일반 계좌 매수분 수량에만 매긴다 (KRW 15.4%, USD 15%, dividend-tax.ts)
   * 5. 지급일이 오늘(한국 시간) 이전인 지급분만 지급월별로 묶어 months·total에 넣고, 오늘 이후 지급 예정분은
   *    scheduled(합계 + 지급일 순 목록)로 따로 돌려준다. 합계는 응답에 보이는 값(버림 후)을 더한다
   *    (기간 수익률·월별 잔고는 months만 쓰므로 지급 예정 배당은 들어가지 않는다)
   */
  async calculate(
    authUser: AuthUser,
    input: DividendHistoryRequest,
  ): Promise<DividendHistoryResponse> {
    const from = input.from ?? null;
    const to = input.to ?? null;
    // 응답 to: 생략하면 오늘(조회 범위는 그대로 끝까지 — 지급 예정 배당 포함)
    const responseTo = to ?? todayInSeoul();

    // 1. 보유했던 종목 (계좌를 주면 그 계좌 매수분만 → 보유 수량도 그 계좌 기준)
    const purchases = await this.purchaseReader.findByUser(
      authUser.id,
      input.accountId,
    );
    const purchasesBySecurity = new Map<string, PurchaseDateBalance[]>();
    for (const purchase of purchases) {
      const list = purchasesBySecurity.get(purchase.securityId) ?? [];
      list.push(purchase);
      purchasesBySecurity.set(purchase.securityId, list);
    }
    const securityIds = [...purchasesBySecurity.keys()];
    if (securityIds.length === 0) {
      return {
        from,
        to: responseTo,
        total: summarize([]),
        months: [],
        scheduled: { total: summarize([]), items: [] },
      };
    }

    const taxedAccountIds = new Set(
      (await this.accountReader.findByUser(authUser.id))
        .filter((account) => isTaxedAccount(account.accountType))
        .map((account) => account.id),
    );

    const securities = await this.securityRepository.findBy({
      id: In(securityIds),
    });
    const securityById = new Map(
      securities
        .filter((s) => isSupportedCurrency(s.currency))
        .map((s) => [s.id, s]),
    );
    // 외부 API 한도(Massive 분당 호출 수 등) 때문에 종목마다 순서대로.
    // 전량 매도 후 오래된 종목은 새 배당·시세가 필요 없으니 저장분만 쓴다
    const today = todayInSeoul();
    for (const security of securityById.values()) {
      if (needsRefresh(purchasesBySecurity.get(security.id) ?? [], today)) {
        await this.securityRefresher.refresh(security);
      }
    }

    // 2. 기간 내 현금배당
    const paymentDate = paymentDateFilter(from, to);
    const dividends = await this.dividendRepository.find({
      where: {
        id: In([...securityById.keys()]),
        type: DividendType.MONEY,
        ...(paymentDate ? { paymentDate } : {}),
      },
      order: { paymentDate: 'ASC', id: 'ASC' },
    });

    // 3~4. 배당별 수령액
    const rateCache = new Map<string, DailyExchangeRate | null>();
    const items: DividendItemDto[] = [];
    for (const dividend of dividends) {
      const security = securityById.get(dividend.id);
      if (!security) {
        continue;
      }
      const entitled = (purchasesBySecurity.get(dividend.id) ?? []).filter(
        (purchase) => isEntitled(purchase, dividend),
      );
      const quantity = sumAmount(entitled);
      if (quantity.lte(0)) {
        continue;
      }
      const currency = security.currency as Currency.KRW | Currency.USD;
      const amount = truncateByCurrency(
        new Decimal(dividend.amount).times(quantity),
        currency,
      );
      const taxableQuantity = sumAmount(
        entitled.filter((purchase) => taxedAccountIds.has(purchase.accountId)),
      );
      const taxAmount = dividendTax(
        new Decimal(dividend.amount).times(taxableQuantity),
        currency,
      );
      const afterTaxAmount = truncateByCurrency(
        new Decimal(amount).minus(taxAmount),
        currency,
      );
      const base = {
        securityId: security.id,
        name: security.name,
        currency,
        noticeDate: dividend.noticeDate,
        exDividendDate: dividend.exDividendDate ?? null,
        paymentDate: dividend.paymentDate,
        perShareAmount: truncateByCurrency(dividend.amount, currency),
        quantity: truncateByCurrency(quantity, currency),
        amount,
        taxAmount,
        afterTaxAmount,
      };
      if (currency === Currency.USD) {
        const rate = await this.exchangeRateReader.findUsdOnOrBefore(
          dividend.paymentDate,
          rateCache,
        );
        items.push({
          ...base,
          usdAmount: amount,
          krwAmount: rate ? toKrw(new Decimal(amount).times(rate.closingRate)) : null,
          afterTaxUsdAmount: afterTaxAmount,
          afterTaxKrwAmount: rate
            ? toKrw(new Decimal(afterTaxAmount).times(rate.closingRate))
            : null,
          exchangeRate: rate ? new Decimal(rate.closingRate).toString() : null,
          exchangeRateDate: rate?.date ?? null,
        });
      } else {
        items.push({
          ...base,
          usdAmount: null,
          krwAmount: amount,
          afterTaxUsdAmount: null,
          afterTaxKrwAmount: afterTaxAmount,
          exchangeRate: null,
          exchangeRateDate: null,
        });
      }
    }

    // 5. 지급분(지급일 <= 오늘)은 월별로, 지급 예정분(지급일 > 오늘)은 scheduled로 따로
    const paid = items.filter((item) => item.paymentDate <= today);
    const scheduled = items.filter((item) => item.paymentDate > today);
    const byMonth = new Map<string, DividendItemDto[]>();
    for (const item of paid) {
      const month = item.paymentDate.slice(0, 7);
      const list = byMonth.get(month) ?? [];
      list.push(item);
      byMonth.set(month, list);
    }

    return {
      from,
      to: responseTo,
      total: summarize(paid),
      scheduled: { total: summarize(scheduled), items: scheduled },
      months: [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, monthItems]) => ({
          month,
          summary: summarize(monthItems),
          items: monthItems,
        })),
    };
  }
}

/** 전량 매도 후에도 온라인 갱신을 계속하는 기간 (락일 뒤 매도분의 미지급 배당 공시·지급을 놓치지 않도록) */
export const REFRESH_AFTER_SALE_YEARS = 1;

/**
 * 종목을 원천에서 갱신해야 하는지. 미매도 매수분이 있거나, 전량 매도했어도 마지막 매도일이
 * 오늘 − REFRESH_AFTER_SALE_YEARS 이후(당일 포함)면 true
 */
export const needsRefresh = (
  purchases: Pick<PurchaseDateBalance, 'saleDate'>[],
  today: string,
): boolean => {
  const since = addYears(today, -REFRESH_AFTER_SALE_YEARS);
  return purchases.some((p) => p.saleDate === null || p.saleDate >= since);
};

const paymentDateFilter = (
  from: string | null,
  to: string | null,
): FindOperator<string> | null => {
  if (from && to) {
    return Between(from, to);
  }
  if (from) {
    return MoreThanOrEqual(from);
  }
  if (to) {
    return LessThanOrEqual(to);
  }
  return null;
};

/**
 * 배당을 받을 권리가 있는 수량.
 * - 배당락일이 있으면: 매수일 < 배당락일 이고 (미매도 또는 매도일 >= 배당락일). 락일 당일 매수는 못 받고, 락일 당일 매도는 받는다
 * - 없으면(예전 행): 매수일 <= 기준일 이고 (미매도 또는 매도일 > 기준일)
 */
export const entitledQuantity = (
  purchases: PurchaseDateBalance[],
  dividend: Pick<Dividend, 'noticeDate' | 'exDividendDate'>,
): Decimal => sumAmount(purchases.filter((p) => isEntitled(p, dividend)));

/** 매수분 하나가 배당을 받을 권리가 있는지 (규칙은 entitledQuantity) */
export const isEntitled = (
  p: Pick<PurchaseDateBalance, 'purchaseDate' | 'saleDate'>,
  dividend: Pick<Dividend, 'noticeDate' | 'exDividendDate'>,
): boolean => {
  const exDate = dividend.exDividendDate ?? null;
  return exDate
    ? p.purchaseDate < exDate && (p.saleDate === null || p.saleDate >= exDate)
    : p.purchaseDate <= dividend.noticeDate &&
        (p.saleDate === null || p.saleDate > dividend.noticeDate);
};

const sumAmount = (purchases: Pick<PurchaseDateBalance, 'amount'>[]): Decimal =>
  purchases.reduce((acc, p) => acc.plus(p.amount), new Decimal(0));

type CurrencySum = { krw: Decimal; usd: Decimal; usdKrw: Decimal };

const newSum = (): CurrencySum => ({
  krw: new Decimal(0),
  usd: new Decimal(0),
  usdKrw: new Decimal(0),
});

/** USD는 달러 합과 원화 환산 합(환율 없는 건 제외)에, KRW는 원화 합에 더한다 */
const addTo = (
  sum: CurrencySum,
  currency: Currency,
  amount: string,
  krwAmount: string | null,
): void => {
  if (currency === Currency.USD) {
    sum.usd = sum.usd.plus(amount);
    if (krwAmount !== null) {
      sum.usdKrw = sum.usdKrw.plus(krwAmount);
    }
  } else {
    sum.krw = sum.krw.plus(amount);
  }
};

const summarize = (items: DividendItemDto[]): DividendSummaryDto => {
  const pre = newSum();
  const post = newSum();
  for (const item of items) {
    addTo(pre, item.currency, item.amount, item.krwAmount);
    addTo(post, item.currency, item.afterTaxAmount, item.afterTaxKrwAmount);
  }
  return {
    krwAmount: toKrw(pre.krw),
    usdAmount: toUsd(pre.usd),
    usdKrwAmount: toKrw(pre.usdKrw),
    totalKrwAmount: toKrw(pre.krw.plus(pre.usdKrw)),
    afterTaxKrwAmount: toKrw(post.krw),
    afterTaxUsdAmount: toUsd(post.usd),
    afterTaxUsdKrwAmount: toKrw(post.usdKrw),
    afterTaxTotalKrwAmount: toKrw(post.krw.plus(post.usdKrw)),
  };
};
