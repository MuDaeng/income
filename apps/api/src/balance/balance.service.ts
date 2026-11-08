import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import {
  Currency,
  DailyExchangeRate,
  DailySecurity,
  PurchaseDateBalance,
  Security,
  truncateByCurrency,
  User,
  UserBalance,
} from '@app/common';
import type { AuthUser } from '../auth/jwt.strategy.js';
import type {
  BalanceItemDto,
  IntegratedBalanceResponse,
} from './integrated-balance.dto.js';
import type { RegisterBalanceRequest } from './register-balance.schema.js';

@Injectable()
export class BalanceService {
  constructor(
    @InjectRepository(PurchaseDateBalance)
    private readonly purchaseDateBalanceRepository: Repository<PurchaseDateBalance>,
    @InjectRepository(UserBalance)
    private readonly userBalanceRepository: Repository<UserBalance>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    @InjectRepository(DailySecurity)
    private readonly dailySecurityRepository: Repository<DailySecurity>,
    @InjectRepository(DailyExchangeRate)
    private readonly dailyExchangeRateRepository: Repository<DailyExchangeRate>,
  ) {}

  /**
   * 매수 잔고 등록.
   * 1. 사용자 검증 2. 종목 검증 3. 매수일 시세 존재 검증 4. 매수 가격이 그날 저가~고가(경계 포함)인지 검증
   * 5. UserBalance(없을 때만 생성) + PurchaseDateBalance(sequence = 같은 사용자·종목·매수일 안의 max + 1) 등록.
   *
   * 동시 등록 시 같은 sequence나 중복 UserBalance가 생기지 않도록 먼저 User 행을 잠근다(SELECT ... FOR UPDATE).
   * PK로 찾는 단일 행 잠금이라 gap lock이 없어서, 같은 사용자의 등록은 순서대로 실행되고 deadlock이 나지 않는다.
   * (매수일별 잔고 행 자체를 잠그면 InnoDB gap lock 때문에 동시 저장끼리 deadlock이 난다)
   */
  @Transactional()
  async registerBalance(
    authUser: AuthUser,
    input: RegisterBalanceRequest,
  ): Promise<PurchaseDateBalance> {
    const userId = authUser.id;
    const { securityId, purchaseDate } = input;

    // 1. 사용자
    const user = await this.userRepository.findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user) {
      throw new UnauthorizedException('존재하지 않는 사용자입니다.');
    }

    // 2. 종목
    const security = await this.securityRepository.findOneBy({
      id: securityId,
    });
    if (!security) {
      throw new NotFoundException('존재하지 않는 종목입니다.');
    }

    // 3. 매수일 시세
    const daily = await this.dailySecurityRepository.findOneBy({
      id: securityId,
      date: purchaseDate,
    });
    if (!daily) {
      throw new BadRequestException('해당 매수일의 시세가 없습니다.');
    }

    // 4. 가격 범위 (종목 통화로 버린 가격으로 비교, 경계 포함)
    const amount = truncateByCurrency(input.amount, security.currency);
    const price = truncateByCurrency(input.price, security.currency);
    const priceValue = new Decimal(price);
    if (
      priceValue.lt(daily.lowestPrice) ||
      priceValue.gt(daily.highestPrice)
    ) {
      throw new BadRequestException(
        '매수 가격이 해당일 저가~고가 범위를 벗어났습니다.',
      );
    }

    // 5. 등록
    const userBalance = await this.userBalanceRepository.findOneBy({
      userId,
      securityId,
    });
    if (!userBalance) {
      await this.userBalanceRepository.save(
        this.userBalanceRepository.create({ userId, securityId }),
      );
    }

    const last = await this.purchaseDateBalanceRepository.findOne({
      where: { userId, securityId, purchaseDate },
      order: { sequence: 'DESC' },
    });

    return this.purchaseDateBalanceRepository.save(
      this.purchaseDateBalanceRepository.create({
        userId,
        securityId,
        purchaseDate,
        sequence: (last?.sequence ?? 0) + 1,
        amount,
        price,
      }),
    );
  }

  /**
   * 통합잔고 조회.
   * 1. 보유 종목(UserBalance + Security) 2. 매수일별 잔고로 종목별 총수량·총매입금액·매입평균가
   * 3. 최신 종가 × 총수량 = 평가금액 4. USD 종목은 최신 USD 환율(closingRate, 1 USD당 원화)을 곱해 원화로 환산
   * 5. 한국(KRW)·미국(USD)·전체(원화) 합계 6. 각 항목의 수익률(%).
   *
   * 합계는 응답에 보이는 종목별 값(통화별로 버림한 값)을 더해서 행의 합과 맞춘다.
   */
  async getIntegratedBalance(
    authUser: AuthUser,
  ): Promise<IntegratedBalanceResponse> {
    const userId = authUser.id;

    // 1. 보유 종목
    const userBalances = await this.userBalanceRepository.find({
      where: { userId },
      relations: { security: true },
      order: { securityId: 'ASC' },
    });

    // 2. 매수일별 잔고를 종목별로 합산
    const purchases = await this.purchaseDateBalanceRepository.find({
      where: { userId },
    });
    const totals = new Map<string, { amount: Decimal; cost: Decimal }>();
    for (const purchase of purchases) {
      const total = totals.get(purchase.securityId) ?? {
        amount: new Decimal(0),
        cost: new Decimal(0),
      };
      total.amount = total.amount.plus(purchase.amount);
      total.cost = total.cost.plus(
        new Decimal(purchase.amount).times(purchase.price),
      );
      totals.set(purchase.securityId, total);
    }

    // 4. USD 종목이 있을 때만 최신 환율
    const hasUsd = userBalances.some(
      (balance) => balance.security.currency === Currency.USD,
    );
    const exchangeRate = hasUsd
      ? await this.dailyExchangeRateRepository.findOne({
          where: { currency: Currency.USD },
          order: { date: 'DESC' },
        })
      : null;
    if (hasUsd && !exchangeRate) {
      throw new NotFoundException('USD 환율 정보가 없습니다.');
    }

    const items: BalanceItemDto[] = [];
    for (const { securityId, security } of userBalances) {
      // 3. 최신 종가
      const latest = await this.dailySecurityRepository.findOne({
        where: { id: securityId },
        order: { date: 'DESC' },
      });
      if (!latest) {
        throw new NotFoundException(`${security.name}의 시세가 없습니다.`);
      }
      const total = totals.get(securityId) ?? {
        amount: new Decimal(0),
        cost: new Decimal(0),
      };
      items.push(
        this.toBalanceItem(
          security,
          total.amount,
          total.cost,
          latest.closingPrice,
          exchangeRate?.closingRate ?? null,
        ),
      );
    }

    // 5. 합계
    const krwItems = items.filter((item) => item.currency === Currency.KRW);
    const usdItems = items.filter((item) => item.currency === Currency.USD);
    const krwPurchase = this.sum(krwItems.map((i) => i.krwPurchaseAmount));
    const krwEvaluation = this.sum(krwItems.map((i) => i.krwEvaluationAmount));
    const usdPurchase = this.sum(usdItems.map((i) => i.usdPurchaseAmount));
    const usdEvaluation = this.sum(usdItems.map((i) => i.usdEvaluationAmount));
    const usdKrwPurchase = this.sum(usdItems.map((i) => i.krwPurchaseAmount));
    const usdKrwEvaluation = this.sum(
      usdItems.map((i) => i.krwEvaluationAmount),
    );
    const totalPurchase = krwPurchase.plus(usdKrwPurchase);
    const totalEvaluation = krwEvaluation.plus(usdKrwEvaluation);

    return {
      items,
      krwTotal: {
        purchaseAmount: toKrw(krwPurchase),
        evaluationAmount: toKrw(krwEvaluation),
        returnRate: this.returnRate(krwPurchase, krwEvaluation),
      },
      usdTotal: {
        usdPurchaseAmount: toUsd(usdPurchase),
        usdEvaluationAmount: toUsd(usdEvaluation),
        krwPurchaseAmount: toKrw(usdKrwPurchase),
        krwEvaluationAmount: toKrw(usdKrwEvaluation),
        returnRate: this.returnRate(usdPurchase, usdEvaluation),
      },
      total: {
        purchaseAmount: toKrw(totalPurchase),
        evaluationAmount: toKrw(totalEvaluation),
        returnRate: this.returnRate(totalPurchase, totalEvaluation),
      },
      exchangeRate: exchangeRate
        ? new Decimal(exchangeRate.closingRate).toString()
        : null,
      exchangeRateDate: exchangeRate?.date ?? null,
    };
  }

  /** 종목 하나의 매입평균가·총매입금액·평가금액(원화/외화)·수익률 */
  private toBalanceItem(
    security: Security,
    amount: Decimal,
    cost: Decimal,
    closingPrice: string,
    usdRate: string | null,
  ): BalanceItemDto {
    const { currency } = security;
    const averagePrice = amount.isZero()
      ? new Decimal(0)
      : cost.dividedBy(amount);
    const evaluation = new Decimal(closingPrice).times(amount);

    const base = {
      securityId: security.id,
      name: security.name,
      currency,
      amount: truncateByCurrency(amount, currency),
      currentPrice: truncateByCurrency(closingPrice, currency),
      returnRate: this.returnRate(cost, evaluation),
    };

    if (currency === Currency.USD) {
      const rate = new Decimal(usdRate!);
      return {
        ...base,
        krwAveragePrice: toKrw(averagePrice.times(rate)),
        usdAveragePrice: toUsd(averagePrice),
        krwPurchaseAmount: toKrw(cost.times(rate)),
        usdPurchaseAmount: toUsd(cost),
        krwEvaluationAmount: toKrw(evaluation.times(rate)),
        usdEvaluationAmount: toUsd(evaluation),
      };
    }
    return {
      ...base,
      krwAveragePrice: toKrw(averagePrice),
      usdAveragePrice: null,
      krwPurchaseAmount: toKrw(cost),
      usdPurchaseAmount: null,
      krwEvaluationAmount: toKrw(evaluation),
      usdEvaluationAmount: null,
    };
  }

  private sum(values: (string | null)[]): Decimal {
    return values.reduce<Decimal>(
      (acc, value) => (value === null ? acc : acc.plus(value)),
      new Decimal(0),
    );
  }

  /** (평가 − 매입) / 매입 × 100, 소수 2자리 버림. 매입이 0이면 '0.00' */
  private returnRate(
    purchase: Decimal.Value,
    evaluation: Decimal.Value,
  ): string {
    const cost = new Decimal(purchase);
    if (cost.isZero()) {
      return '0.00';
    }
    return new Decimal(evaluation)
      .minus(cost)
      .dividedBy(cost)
      .times(100)
      .toDecimalPlaces(2, Decimal.ROUND_DOWN)
      .toFixed(2);
  }
}

const toKrw = (value: Decimal.Value): string =>
  truncateByCurrency(value, Currency.KRW);
const toUsd = (value: Decimal.Value): string =>
  truncateByCurrency(value, Currency.USD);
