import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import {
  Currency,
  DailyExchangeRate,
  DailySecurity,
  decimalPlacesOf,
  PurchaseDateBalance,
  Security,
  truncateByCurrency,
  User,
  UserBalance,
} from '@app/common';
import type { AuthUser } from '../auth/jwt.strategy.js';
import { SecurityRefreshService } from '../security/security-refresh.service.js';
import type {
  BalanceItemDto,
  IntegratedBalanceResponse,
} from './integrated-balance.dto.js';
import type { DeletePurchaseRequest } from './delete-purchase.schema.js';
import type { RegisterBalanceRequest } from './register-balance.schema.js';
import type {
  PurchaseHistoryItemDto,
  PurchaseHistoryResponse,
} from './purchase-history.dto.js';
import type { PurchaseHistoryRequest } from './purchase-history.schema.js';
import type { SellBalanceRequest } from './sell-balance.schema.js';
import { returnRate } from './return-rate.js';

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
    private readonly securityRefreshService: SecurityRefreshService,
  ) {}

  /**
   * 매수 잔고 등록. 등록(saveBalance 트랜잭션)이 커밋된 뒤에 그 종목의 배당·시세를 갱신한다(하루 한 번).
   * 갱신을 트랜잭션 밖에서 하는 이유: 등록이 검증에서 실패하면 외부 API를 호출하지 않고,
   * 등록 실패로 배당·조회 기록까지 롤백되는 일도 없게 하려고.
   * 갱신이 실패해도(SecurityRefreshService가 로그만 남김) 등록 결과는 그대로 돌려준다.
   */
  async registerBalance(
    authUser: AuthUser,
    input: RegisterBalanceRequest,
  ): Promise<PurchaseDateBalance> {
    const { saved, security } = await this.saveBalance(authUser, input);
    await this.securityRefreshService.refresh(security);
    return saved;
  }

  /**
   * 매수 잔고 저장 (한 트랜잭션).
   * 1. 사용자 검증 2. 종목 검증 3. 매수일 시세 존재 검증 4. 매수 가격이 그날 저가~고가(경계 포함)인지 검증
   * 5. UserBalance(없을 때만 생성) + PurchaseDateBalance(sequence = 같은 사용자·종목·매수일 안의 max + 1) 등록.
   *    매도일(saleDate)은 입력에 있으면 저장하고, 없으면 null(보유 중).
   *
   * 동시 등록 시 같은 sequence나 중복 UserBalance가 생기지 않도록 먼저 User 행을 잠근다(SELECT ... FOR UPDATE).
   * PK로 찾는 단일 행 잠금이라 gap lock이 없어서, 같은 사용자의 등록은 순서대로 실행되고 deadlock이 나지 않는다.
   * (매수일별 잔고 행 자체를 잠그면 InnoDB gap lock 때문에 동시 저장끼리 deadlock이 난다)
   */
  @Transactional()
  private async saveBalance(
    authUser: AuthUser,
    input: RegisterBalanceRequest,
  ): Promise<{ saved: PurchaseDateBalance; security: Security }> {
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

    const saved = await this.purchaseDateBalanceRepository.save(
      this.purchaseDateBalanceRepository.create({
        userId,
        securityId,
        purchaseDate,
        sequence: (last?.sequence ?? 0) + 1,
        amount,
        price,
        saleDate: input.saleDate ?? null,
      }),
    );
    return { saved, security };
  }

  /**
   * 매도 등록. 매수분 하나(종목·매수일·sequence, 미매도)의 전량 또는 일부를 매도일로 매도 처리한다.
   * - 매도 수량 > 보유 수량: 400
   * - 전량: 같은 매도일·매수가의 매도 행이 있으면 거기에 더하고 미매도 행은 삭제, 없으면 미매도 행에 saleDate만 저장
   * - 일부: 미매도 행에서 빼고, 같은 매도일·매수가의 매도 행이 있으면 거기에 더하고,
   *   없으면 새 행(saleDate·수량은 입력, 매수가는 미매도 행 값, sequence는 같은 매수일 안의 max + 1)을 저장
   *
   * 매수가까지 같은 행만 합쳐서, 같은 날 다른 가격에 산 매수분과 섞이지 않게 한다.
   * registerBalance와 같은 이유로 먼저 User 행을 잠가 같은 사용자의 매수·매도를 순서대로 실행한다.
   */
  @Transactional()
  async sellBalance(
    authUser: AuthUser,
    input: SellBalanceRequest,
  ): Promise<PurchaseDateBalance> {
    const userId = authUser.id;
    const { securityId, purchaseDate, sequence, saleDate } = input;

    const user = await this.userRepository.findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user) {
      throw new UnauthorizedException('존재하지 않는 사용자입니다.');
    }

    const source = await this.purchaseDateBalanceRepository.findOne({
      where: { userId, securityId, purchaseDate, sequence, saleDate: IsNull() },
    });
    if (!source) {
      throw new NotFoundException('매도할 보유 잔고가 없습니다.');
    }

    const security = await this.securityRepository.findOneBy({
      id: securityId,
    });
    if (!security) {
      throw new NotFoundException('존재하지 않는 종목입니다.');
    }
    const { currency } = security;
    const amount = new Decimal(truncateByCurrency(input.amount, currency));
    const held = new Decimal(source.amount);
    if (amount.gt(held)) {
      throw new BadRequestException('매도 수량이 보유 수량보다 많습니다.');
    }

    const sold = await this.purchaseDateBalanceRepository.findOne({
      where: { userId, securityId, purchaseDate, saleDate, price: source.price },
    });

    // 3. 전량 매도
    if (amount.eq(held)) {
      if (!sold) {
        source.saleDate = saleDate;
        return this.purchaseDateBalanceRepository.save(source);
      }
      sold.amount = truncateByCurrency(amount.plus(sold.amount), currency);
      await this.purchaseDateBalanceRepository.delete({
        userId,
        securityId,
        purchaseDate,
        sequence,
      });
      return this.purchaseDateBalanceRepository.save(sold);
    }

    // 4. 일부 매도
    source.amount = truncateByCurrency(held.minus(amount), currency);
    await this.purchaseDateBalanceRepository.save(source);

    // 4-1. 같은 매도일 행에 더함
    if (sold) {
      sold.amount = truncateByCurrency(amount.plus(sold.amount), currency);
      return this.purchaseDateBalanceRepository.save(sold);
    }

    // 4-2. 새 매도 행
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
        amount: truncateByCurrency(amount, currency),
        price: source.price,
        saleDate,
      }),
    );
  }

  /**
   * 잘못 등록한 매수분 하나(종목·매수일·sequence) 삭제. 매도된 행도 지울 수 있다. 없으면 404.
   * 그 종목의 매수분이 하나도 남지 않으면 UserBalance도 지운다(오등록한 종목이 보유 목록에 남지 않게).
   * 다른 매수분의 sequence는 다시 매기지 않는다(매수 내역·매도 요청이 들고 있는 값이 바뀌지 않게).
   * registerBalance·sellBalance와 같은 이유로 먼저 User 행을 잠가 같은 사용자의 변경을 순서대로 실행한다.
   */
  @Transactional()
  async deletePurchase(
    authUser: AuthUser,
    input: DeletePurchaseRequest,
  ): Promise<void> {
    const userId = authUser.id;
    const { securityId, purchaseDate, sequence } = input;

    const user = await this.userRepository.findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user) {
      throw new UnauthorizedException('존재하지 않는 사용자입니다.');
    }

    const { affected } = await this.purchaseDateBalanceRepository.delete({
      userId,
      securityId,
      purchaseDate,
      sequence,
    });
    if (!affected) {
      throw new NotFoundException('삭제할 매수 내역이 없습니다.');
    }

    const remaining = await this.purchaseDateBalanceRepository.existsBy({
      userId,
      securityId,
    });
    if (!remaining) {
      await this.userBalanceRepository.delete({ userId, securityId });
    }
  }

  /**
   * 종목 하나의 매수 내역 (매수일 최신순, 같은 날은 sequence 역순). 매도한 매수분도 saleDate와 함께 포함.
   * 구매 환율은 USD 종목만 매수일(이전 최근) USD 종가 환율, KRW 종목은 null. 종목이 없으면 404.
   */
  async getPurchases(
    authUser: AuthUser,
    input: PurchaseHistoryRequest,
  ): Promise<PurchaseHistoryResponse> {
    const found = await this.securityRepository.findOneBy({
      id: input.securityId,
    });
    if (!found) {
      throw new NotFoundException('존재하지 않는 종목입니다.');
    }
    const { id, symbol, name, currency } = found;
    const purchases = await this.purchaseDateBalanceRepository.find({
      where: { userId: authUser.id, securityId: id },
      order: { purchaseDate: 'DESC', sequence: 'DESC' },
    });

    // 응답 가격은 소수 2자리까지 버림 (KRW는 원래 정수)
    const pricePlaces = Math.min(decimalPlacesOf(currency), 2);
    const rates = new Map<string, DailyExchangeRate | null>();
    const items: PurchaseHistoryItemDto[] = [];
    for (const purchase of purchases) {
      let rate: DailyExchangeRate | null = null;
      if (currency === Currency.USD) {
        if (!rates.has(purchase.purchaseDate)) {
          rates.set(
            purchase.purchaseDate,
            await this.dailyExchangeRateRepository.findOne({
              where: {
                currency: Currency.USD,
                date: LessThanOrEqual(purchase.purchaseDate),
              },
              order: { date: 'DESC' },
            }),
          );
        }
        rate = rates.get(purchase.purchaseDate) ?? null;
      }
      items.push({
        purchaseDate: purchase.purchaseDate,
        sequence: purchase.sequence,
        amount: truncateByCurrency(purchase.amount, currency),
        price: new Decimal(purchase.price)
          .toDecimalPlaces(pricePlaces, Decimal.ROUND_DOWN)
          .toFixed(pricePlaces),
        saleDate: purchase.saleDate,
        exchangeRate: rate ? new Decimal(rate.closingRate).toString() : null,
        exchangeRateDate: rate?.date ?? null,
      });
    }
    return { security: { id, symbol, name, currency }, items };
  }

  /**
   * 통합잔고 조회.
   * 1. 보유 종목(UserBalance + Security) 2. 매도하지 않은(saleDate IS NULL) 매수일별 잔고로 종목별 총수량·총매입금액·매입평균가
   *    (미매도 매수분이 없는 종목, 즉 전량 매도한 종목은 제외)
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

    // 2. 매도하지 않은 매수일별 잔고를 종목별로 합산
    const purchases = await this.purchaseDateBalanceRepository.find({
      where: { userId, saleDate: IsNull() },
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

    // 전량 매도한 종목 제외
    const heldBalances = userBalances.filter((balance) =>
      totals.has(balance.securityId),
    );

    // 4. USD 종목이 있을 때만 최신 환율
    const hasUsd = heldBalances.some(
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
    for (const { securityId, security } of heldBalances) {
      // 3. 최신 종가
      const latest = await this.dailySecurityRepository.findOne({
        where: { id: securityId },
        order: { date: 'DESC' },
      });
      if (!latest) {
        throw new NotFoundException(`${security.name}의 시세가 없습니다.`);
      }
      const total = totals.get(securityId)!;
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
        returnRate: returnRate(krwPurchase, krwEvaluation),
      },
      usdTotal: {
        usdPurchaseAmount: toUsd(usdPurchase),
        usdEvaluationAmount: toUsd(usdEvaluation),
        krwPurchaseAmount: toKrw(usdKrwPurchase),
        krwEvaluationAmount: toKrw(usdKrwEvaluation),
        returnRate: returnRate(usdPurchase, usdEvaluation),
      },
      total: {
        purchaseAmount: toKrw(totalPurchase),
        evaluationAmount: toKrw(totalEvaluation),
        returnRate: returnRate(totalPurchase, totalEvaluation),
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
      returnRate: returnRate(cost, evaluation),
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
}

const toKrw = (value: Decimal.Value): string =>
  truncateByCurrency(value, Currency.KRW);
const toUsd = (value: Decimal.Value): string =>
  truncateByCurrency(value, Currency.USD);

