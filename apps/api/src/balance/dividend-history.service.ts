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
  Currency,
  DailyExchangeRate,
  Dividend,
  DividendType,
  PurchaseDateBalance,
  Security,
  truncateByCurrency,
} from '@app/common';
import type { AuthUser } from '../auth/jwt.strategy.js';
import { SecurityRefreshService } from '../security/security-refresh.service.js';
import type {
  DividendHistoryResponse,
  DividendItemDto,
  DividendSummaryDto,
} from './dividend-history.dto.js';
import type { DividendHistoryRequest } from './dividend-history.schema.js';

@Injectable()
export class DividendHistoryService {
  constructor(
    @InjectRepository(PurchaseDateBalance)
    private readonly purchaseDateBalanceRepository: Repository<PurchaseDateBalance>,
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    @InjectRepository(Dividend)
    private readonly dividendRepository: Repository<Dividend>,
    @InjectRepository(DailyExchangeRate)
    private readonly dailyExchangeRateRepository: Repository<DailyExchangeRate>,
    private readonly securityRefreshService: SecurityRefreshService,
  ) {}

  /**
   * 배당금 내역 조회.
   * 1. 사용자의 매수일별 잔고(매도분 포함)로 지금까지 보유한 종목을 구하고, 종목마다 배당·시세를 원천에서 갱신한다
   *    (종목별 하루 한 번, 실패해도 저장분으로 계속)
   * 2. 그 종목들의 현금배당(MONEY) 중 지급일이 [from, to]인 것 (입력이 없으면 그쪽은 제한 없음, 지급 예정 포함)
   * 3. 배당마다 기준일(noticeDate) 보유 수량 = purchaseDate <= 기준일 < saleDate(없으면 보유 중)인 매수분 수량 합.
   *    0이면 받지 않은 배당이라 제외
   * 4. 배당금 = 주당 배당금 × 보유 수량 (종목 통화로 버림). USD는 지급일(없으면 직전) USD 종가 환율로 원화 환산
   * 5. 지급월별로 묶고, 월·전체 합계는 응답에 보이는 값(버림 후)을 더한다
   */
  async getDividendHistory(
    authUser: AuthUser,
    input: DividendHistoryRequest,
  ): Promise<DividendHistoryResponse> {
    const from = input.from ?? null;
    const to = input.to ?? null;

    // 1. 보유했던 종목
    const purchases = await this.purchaseDateBalanceRepository.find({
      where: { userId: authUser.id },
    });
    const purchasesBySecurity = new Map<string, PurchaseDateBalance[]>();
    for (const purchase of purchases) {
      const list = purchasesBySecurity.get(purchase.securityId) ?? [];
      list.push(purchase);
      purchasesBySecurity.set(purchase.securityId, list);
    }
    const securityIds = [...purchasesBySecurity.keys()];
    if (securityIds.length === 0) {
      return { from, to, total: summarize([]), months: [] };
    }

    const securities = await this.securityRepository.findBy({
      id: In(securityIds),
    });
    const securityById = new Map(
      securities
        .filter((s) => s.currency === Currency.KRW || s.currency === Currency.USD)
        .map((s) => [s.id, s]),
    );
    // 외부 API 한도(Massive 분당 호출 수 등) 때문에 종목마다 순서대로
    for (const security of securityById.values()) {
      await this.securityRefreshService.refresh(security);
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
      const quantity = heldQuantity(
        purchasesBySecurity.get(dividend.id) ?? [],
        dividend.noticeDate,
      );
      if (quantity.lte(0)) {
        continue;
      }
      const { currency } = security;
      const amount = truncateByCurrency(
        new Decimal(dividend.amount).times(quantity),
        currency,
      );
      const base = {
        securityId: security.id,
        name: security.name,
        currency,
        noticeDate: dividend.noticeDate,
        paymentDate: dividend.paymentDate,
        perShareAmount: truncateByCurrency(dividend.amount, currency),
        quantity: truncateByCurrency(quantity, currency),
        amount,
      };
      if (currency === Currency.USD) {
        const rate = await this.findUsdRate(dividend.paymentDate, rateCache);
        items.push({
          ...base,
          usdAmount: amount,
          krwAmount: rate ? toKrw(new Decimal(amount).times(rate.closingRate)) : null,
          exchangeRate: rate ? new Decimal(rate.closingRate).toString() : null,
          exchangeRateDate: rate?.date ?? null,
        });
      } else {
        items.push({
          ...base,
          usdAmount: null,
          krwAmount: amount,
          exchangeRate: null,
          exchangeRateDate: null,
        });
      }
    }

    // 5. 월별
    const byMonth = new Map<string, DividendItemDto[]>();
    for (const item of items) {
      const month = item.paymentDate.slice(0, 7);
      const list = byMonth.get(month) ?? [];
      list.push(item);
      byMonth.set(month, list);
    }

    return {
      from,
      to,
      total: summarize(items),
      months: [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, monthItems]) => ({
          month,
          summary: summarize(monthItems),
          items: monthItems,
        })),
    };
  }

  /** 지급일(포함) 이전 가장 최근 USD 환율. 지급일별로 한 번만 조회 */
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

/** 기준일에 보유 중인 수량: 매수일 <= 기준일 이고 (미매도 또는 매도일 > 기준일) */
const heldQuantity = (
  purchases: PurchaseDateBalance[],
  noticeDate: string,
): Decimal =>
  purchases
    .filter(
      (p) =>
        p.purchaseDate <= noticeDate &&
        (p.saleDate === null || p.saleDate > noticeDate),
    )
    .reduce((acc, p) => acc.plus(p.amount), new Decimal(0));

const summarize = (items: DividendItemDto[]): DividendSummaryDto => {
  let krw = new Decimal(0);
  let usd = new Decimal(0);
  let usdKrw = new Decimal(0);
  for (const item of items) {
    if (item.currency === Currency.USD) {
      usd = usd.plus(item.amount);
      if (item.krwAmount !== null) {
        usdKrw = usdKrw.plus(item.krwAmount);
      }
    } else {
      krw = krw.plus(item.amount);
    }
  }
  return {
    krwAmount: toKrw(krw),
    usdAmount: truncateByCurrency(usd, Currency.USD),
    usdKrwAmount: toKrw(usdKrw),
    totalKrwAmount: toKrw(krw.plus(usdKrw)),
  };
};

const toKrw = (value: Decimal.Value): string =>
  truncateByCurrency(value, Currency.KRW);
