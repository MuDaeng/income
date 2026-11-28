import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { In, IsNull, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import {
  type Account,
  addDays,
  Currency,
  type DailyExchangeRate,
  decimalPlacesOf,
  PurchaseDateBalance,
  Security,
  SecurityCompany,
  toKrw,
  toUsd,
  truncateByCurrency,
  truncateRate,
  UserBalance,
} from '@app/common';
import { sumDecimals } from '../money.js';
import type { AuthUser } from '../../auth/restapi/jwt.strategy.js';
import { DailyPriceReader } from '../../security/daily-price.reader.js';
import { ExchangeRateReader } from '../../security/exchange-rate.reader.js';
import { SecurityRefresher } from '../../security/security.refresher.js';
import { AccountReader } from '../../user/account.reader.js';
import { AccountWriter } from '../../user/account.writer.js';
import type {
  BalanceItemDto,
  IntegratedBalanceResponse,
} from './dto/integrated-balance.dto.js';
import type { BulkSellBalanceRequest } from './dto/bulk-sell-balance.schema.js';
import type {
  BulkRegisterBalanceTossResponse,
  TossLentTransferDto,
  TossSkippedTransactionDto,
} from './dto/bulk-register-balance-toss.dto.js';
import type {
  BulkRegisterBalanceTossRequest,
  TossTransactionRequest,
} from './dto/bulk-register-balance-toss.schema.js';
import { tossTradeDate } from '../toss-trade-date.js';
import { offsetTossLending, type TossTransfer } from '../toss-lending.js';
import { accountAmountsOf } from '../account-amount.js';
import type { AccountAmountDto } from './dto/account-amount.dto.js';
import type { DeletePurchaseRequest } from './dto/delete-purchase.schema.js';
import type { IntegratedBalanceRequest } from './dto/integrated-balance.schema.js';
import type { RegisterBalanceRequest } from './dto/register-balance.schema.js';
import type {
  PurchaseHistoryItemDto,
  PurchaseHistoryResponse,
} from './dto/purchase-history.dto.js';
import type { PurchaseHistoryRequest } from './dto/purchase-history.schema.js';
import { PurchaseRateReader } from '../purchase-rate.reader.js';
import { PurchaseWriter } from '../purchase.writer.js';
import type { SellBalanceRequest } from './dto/sell-balance.schema.js';
import type { UpdateExchangeRateRequest } from './dto/update-exchange-rate.schema.js';
import type { UpdatePurchaseAccountRequest } from './dto/update-purchase-account.schema.js';
import { returnRate } from '../return-rate.js';

/** Toss 일괄 등록에서 매수분으로 등록하는 거래 유형 (입고는 이벤트·소수점 주식 지급, 빌려주기 반환 등) */
const BUY_TYPES: readonly string[] = ['BUY', 'SECURITIES_TRANSFER_IN'];
/** Toss 일괄 등록에서 LIFO 매도하는 거래 유형 (출고는 빌려주기 상쇄 후 실제 출고로 지정된 것만) */
const SELL_TYPES: readonly string[] = ['SELL', 'SECURITIES_TRANSFER_OUT'];
const TRANSFER_IN = 'SECURITIES_TRANSFER_IN';
const TRANSFER_OUT = 'SECURITIES_TRANSFER_OUT';

@Injectable()
export class BalanceService {
  constructor(
    @InjectRepository(PurchaseDateBalance)
    private readonly purchaseDateBalanceRepository: Repository<PurchaseDateBalance>,
    @InjectRepository(UserBalance)
    private readonly userBalanceRepository: Repository<UserBalance>,
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    private readonly securityRefresher: SecurityRefresher,
    private readonly dailyPriceReader: DailyPriceReader,
    private readonly exchangeRateReader: ExchangeRateReader,
    private readonly purchaseRateReader: PurchaseRateReader,
    private readonly purchaseWriter: PurchaseWriter,
    private readonly accountReader: AccountReader,
    private readonly accountWriter: AccountWriter,
  ) {}

  /**
   * 매수 잔고 등록. 등록(saveBalance 트랜잭션)이 커밋된 뒤에 그 종목의 배당·시세를 갱신한다(하루 한 번).
   * 갱신을 트랜잭션 밖에서 하는 이유: 등록이 검증에서 실패하면 외부 API를 호출하지 않고,
   * 등록 실패로 배당·조회 기록까지 롤백되는 일도 없게 하려고.
   * 갱신이 실패해도(SecurityRefresher가 로그만 남김) 등록 결과는 그대로 돌려준다.
   */
  async registerBalance(
    authUser: AuthUser,
    input: RegisterBalanceRequest,
  ): Promise<PurchaseDateBalance> {
    const { saved, security } = await this.saveBalance(authUser, input);
    await this.securityRefresher.refresh(security);
    return saved;
  }

  /**
   * 매수 잔고 저장 (한 트랜잭션).
   * 1. 사용자 검증 2. 종목 검증 3. 매수일 시세 존재 검증 4. 매수 가격이 그날 저가~고가(경계 포함)인지 검증
   * 5. 계좌 결정(AccountWriter.resolve: accountId → 그 증권사의 첫 계좌 → 없으면 일반 계좌 생성)
   *    + UserBalance(계좌별, 없을 때만 생성) + PurchaseDateBalance(sequence = 같은 사용자·종목·매수일 안의 max + 1) 등록.
   *    매도일(saleDate)은 입력에 있으면 저장하고, 없으면 null(보유 중).
   *
   * 동시 등록 시 같은 sequence나 중복 UserBalance가 생기지 않도록 먼저 User 행을 잠근다(PurchaseWriter.lockOwner).
   */
  @Transactional()
  private async saveBalance(
    authUser: AuthUser,
    input: RegisterBalanceRequest,
  ): Promise<{ saved: PurchaseDateBalance; security: Security }> {
    const userId = authUser.id;
    const { securityId, purchaseDate } = input;

    // 1. 사용자
    await this.purchaseWriter.lockOwner(userId);

    // 2. 종목
    const security = await this.securityRepository.findOneBy({
      id: securityId,
    });
    if (!security) {
      throw new NotFoundException('존재하지 않는 종목입니다.');
    }

    // 3. 매수일 시세
    const daily = await this.dailyPriceReader.findOn(securityId, purchaseDate);
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

    // 구매 환율: KRW 종목은 null, 그 외는 입력값 → 없으면 매수일(이전 최근) USD 환율 → 그것도 없으면 null
    let exchangeRate: string | null = null;
    if (security.currency !== Currency.KRW) {
      const rate =
        input.exchangeRate ??
        (await this.exchangeRateReader.findUsdOnOrBefore(purchaseDate))
          ?.closingRate;
      exchangeRate = rate ? truncateRate(rate) : null;
    }

    // 5. 등록
    const account = await this.accountWriter.resolve(
      userId,
      input.securityCompany,
      input.accountId,
    );
    const saved = await this.purchaseWriter.append({
      userId,
      accountId: account.id,
      securityId,
      purchaseDate,
      amount,
      price,
      saleDate: input.saleDate ?? null,
      exchangeRate,
    });
    return { saved, security };
  }

  /**
   * 매도 등록. 매수분 하나(종목·매수일·sequence, 미매도)의 전량 또는 일부를 매도일로 매도 처리한다.
   * - 매도 수량 > 보유 수량: 400
   * - 전량: 같은 매도일·매수가의 매도 행이 있으면 거기에 더하고 미매도 행은 삭제, 없으면 미매도 행에 saleDate만 저장
   * - 일부: 미매도 행에서 빼고, 같은 매도일·매수가의 매도 행이 있으면 거기에 더하고,
   *   없으면 새 행(saleDate·수량은 입력, 매수가는 미매도 행 값, sequence는 같은 매수일 안의 max + 1)을 저장
   *
   * 매수가·구매 환율·계좌까지 같은 행만 합쳐서, 같은 날 다른 가격·다른 계좌에서 산 매수분과 섞이지 않게 한다.
   * 새로 만드는 매도 행은 원래 매수분의 계좌를 그대로 가진다.
   * registerBalance와 같은 이유로 먼저 User 행을 잠가 같은 사용자의 매수·매도를 순서대로 실행한다.
   */
  @Transactional()
  async sellBalance(
    authUser: AuthUser,
    input: SellBalanceRequest,
  ): Promise<PurchaseDateBalance> {
    const userId = authUser.id;
    const { securityId, purchaseDate, sequence, saleDate } = input;

    await this.purchaseWriter.lockOwner(userId);

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
    if (amount.gt(source.amount)) {
      throw new BadRequestException('매도 수량이 보유 수량보다 많습니다.');
    }
    return this.purchaseWriter.sell(source, amount, saleDate, currency);
  }

  /**
   * 계좌별 일괄매도. 계좌(accountId, 없으면 그 증권사의 첫 계좌)의 미매도 매수분 중 매도일 이전(포함)에 산 것을
   * 매수일이 최근인 순(같은 날은 sequence 큰 순)으로 매도 수량만큼 매도 처리한다(LIFO).
   * - 대상 보유 수량 합계 < 매도 수량: 400 (아무것도 매도하지 않음)
   * - 행마다의 전량/일부 매도·같은 매도 행 병합 규칙은 sellBalance와 같다(PurchaseWriter.sell).
   * 매도 처리된 행(saleDate가 찍힌 행, 합쳐진 행, 새 매도 행)을 처리 순서대로 돌려준다.
   * registerBalance·sellBalance와 같은 이유로 먼저 User 행을 잠가 같은 사용자의 변경을 순서대로 실행한다.
   */
  @Transactional()
  async bulkSellBalance(
    authUser: AuthUser,
    input: BulkSellBalanceRequest,
  ): Promise<PurchaseDateBalance[]> {
    const userId = authUser.id;
    const { securityId, securityCompany, saleDate } = input;

    await this.purchaseWriter.lockOwner(userId);
    const account = await this.accountWriter.resolve(
      userId,
      securityCompany,
      input.accountId,
    );

    const security = await this.securityRepository.findOneBy({
      id: securityId,
    });
    if (!security) {
      throw new NotFoundException('존재하지 않는 종목입니다.');
    }
    const { currency } = security;
    const amount = new Decimal(truncateByCurrency(input.amount, currency));
    return this.purchaseWriter.sellLifo(
      userId,
      account.id,
      securityId,
      amount,
      saleDate,
      currency,
    );
  }

  /**
   * Toss 거래내역으로 Toss 계좌 하나의 잔고를 다시 만든다 (한 트랜잭션, 실패하면 삭제까지 롤백).
   * 0. 계좌 결정 (accountId → 첫 Toss 계좌 → 없으면 일반 계좌 생성, AccountWriter.resolve)
   * 1. 그 계좌의 매수분(매도분 포함)과 보유 종목을 모두 삭제
   * 2. 주식 빌려주기 상쇄(offsetTossLending): 출고는 기본으로 빌려주기(대여 중)로 보고 매도하지 않고,
   *    입고는 앞선 빌려주기 출고의 미반환 수량에서 먼저 빼서(반환) 무시한다. confirmedTransfersOut에 있는 출고만 실제 출고로 매도
   * 3. BUY·남은 입고를 거래일 오름차순으로 등록 — 일별 시세 존재·가격 범위는 검증하지 않음
   *    (amount = quantity, price = filledPrice, 종목 통화로 버림, 환율은 registerBalance와 같은 규칙)
   *    입고는 체결 단가가 없으므로 입고일(포함) 이전 가장 최근 종가를 price로 쓴다
   * 4. SELL·실제 출고를 거래일 오름차순으로 그 계좌 매수분에서 LIFO 매도 (보유 부족이면 400)
   * 취소 거래, isinCode로 종목을 못 찾는 거래, 수량·단가가 없는 거래, 시세가 없는 입고, 빌려주기로 상쇄된 입출고는
   * 건너뛰고 skipped에 담는다. 반환되지 않은 빌려주기 출고는 lentTransfers로 돌려준다. 그 밖의 유형(입출금·배당 등)은 무시.
   * 거래일 = settlementDate − 2거래일(tossTradeDate, 국내 거래일 목록은 한 번만 읽음).
   * 외부 갱신(SecurityRefresher)은 하지 않는다(조회 API가 갱신).
   */
  @Transactional()
  async bulkRegisterToss(
    authUser: AuthUser,
    input: BulkRegisterBalanceTossRequest,
  ): Promise<BulkRegisterBalanceTossResponse> {
    const userId = authUser.id;

    await this.purchaseWriter.lockOwner(userId);
    const account = await this.accountWriter.resolve(
      userId,
      SecurityCompany.TOSS,
      input.accountId,
    );
    const accountId = account.id;
    const deletedCount = await this.purchaseWriter.removeByAccount(
      userId,
      accountId,
    );

    const trades = input.transactionList.filter(
      (t) =>
        BUY_TYPES.includes(t.transactionType) ||
        SELL_TYPES.includes(t.transactionType),
    );
    const isins = [
      ...new Set(
        trades.flatMap((t) => (t.isinCode ? [t.isinCode] : [])),
      ),
    ];
    const securities = new Map(
      (isins.length > 0
        ? await this.securityRepository.findBy({ id: In(isins) })
        : []
      ).map((security) => [security.id, security]),
    );
    // 체결일 계산용 국내 거래일: 결제일 범위(+ 앞쪽 여유 14일)를 한 번만 읽는다
    const settlementDates = trades.map((t) => t.settlementDate).sort();
    const tradingDays =
      settlementDates.length > 0
        ? await this.dailyPriceReader.findKrwTradingDays(
            addDays(settlementDates[0], -14),
            settlementDates[settlementDates.length - 1],
          )
        : [];

    const skipped: TossSkippedTransactionDto[] = [];
    const skip = (t: TossTransactionRequest, reason: string) =>
      skipped.push({
        transactionType: t.transactionType,
        isinCode: t.isinCode,
        reason,
      });

    type Trade = {
      transaction: TossTransactionRequest;
      security: Security;
      date: string;
      quantity: string;
    };
    type Transfer = TossTransfer & { trade: Trade };
    const buys: (Trade & { price: string })[] = [];
    const sells: Trade[] = [];
    const transfers: Transfer[] = [];
    for (const transaction of trades) {
      if (transaction.isCancellation) {
        skip(transaction, '취소 거래');
        continue;
      }
      const security = transaction.isinCode
        ? securities.get(transaction.isinCode)
        : undefined;
      if (!security) {
        skip(transaction, '종목을 찾을 수 없음');
        continue;
      }
      const { quantity, transactionType } = transaction;
      const isTransfer =
        transactionType === TRANSFER_IN || transactionType === TRANSFER_OUT;
      if (
        quantity === null ||
        (transactionType === 'BUY' && transaction.filledPrice === null)
      ) {
        skip(transaction, '수량 또는 단가 없음');
        continue;
      }
      const date = tossTradeDate(transaction.settlementDate, tradingDays);
      const trade = { transaction, security, date, quantity };
      if (isTransfer) {
        transfers.push({
          direction: transactionType === TRANSFER_IN ? 'IN' : 'OUT',
          isinCode: security.id,
          settlementDate: transaction.settlementDate,
          transactionTime: transaction.transactionTime,
          quantity,
          trade,
        });
      } else if (transactionType === 'BUY') {
        buys.push({ ...trade, price: transaction.filledPrice! });
      } else {
        sells.push(trade);
      }
    }

    // 주식 빌려주기 상쇄
    const lending = offsetTossLending(transfers, input.confirmedTransfersOut);
    for (const { trade } of lending.returned) {
      skip(trade.transaction, '빌려주기 반환');
    }
    for (const { trade } of lending.repaid) {
      skip(trade.transaction, '빌려주기 출고(반환됨)');
    }
    for (const { trade } of lending.transfersOut) {
      sells.push(trade);
    }
    for (const { transfer, quantity } of lending.transfersIn) {
      const { trade } = transfer;
      // 입고에는 체결 단가가 없으므로 입고일(휴장일이면 그 이전) 종가를 매수가로 쓴다
      const price =
        (
          await this.dailyPriceReader.findLatestOnOrBefore(
            trade.security.id,
            trade.date,
          )
        )?.closingPrice ?? null;
      if (price === null) {
        skip(trade.transaction, '입고일 시세 없음');
        continue;
      }
      buys.push({ ...trade, quantity, price });
    }
    const lentTransfers: TossLentTransferDto[] = lending.lent.map(
      ({ key, quantity }) => ({ key, remainingQuantity: quantity }),
    );

    const byDate = (a: Trade, b: Trade) => a.date.localeCompare(b.date);
    buys.sort(byDate);
    sells.sort(byDate);

    for (const { transaction, security, date, quantity, price } of buys) {
      let exchangeRate: string | null = null;
      if (security.currency !== Currency.KRW) {
        const rate =
          transaction.exchangeRate ??
          (await this.exchangeRateReader.findUsdOnOrBefore(date))?.closingRate;
        exchangeRate = rate ? truncateRate(rate) : null;
      }
      await this.purchaseWriter.append({
        userId,
        accountId,
        securityId: security.id,
        purchaseDate: date,
        amount: truncateByCurrency(quantity, security.currency),
        price: truncateByCurrency(price, security.currency),
        saleDate: null,
        exchangeRate,
      });
    }

    for (const { security, date, quantity } of sells) {
      await this.purchaseWriter.sellLifo(
        userId,
        accountId,
        security.id,
        new Decimal(truncateByCurrency(quantity, security.currency)),
        date,
        security.currency,
      );
    }

    return {
      accountId,
      deletedCount,
      boughtCount: buys.length,
      soldCount: sells.length,
      skipped,
      lentTransfers,
    };
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

    await this.purchaseWriter.lockOwner(userId);

    const removed = await this.purchaseWriter.remove({
      userId,
      securityId,
      purchaseDate,
      sequence,
    });
    if (!removed) {
      throw new NotFoundException('삭제할 매수 내역이 없습니다.');
    }
  }

  /**
   * 매수분 하나(종목·매수일·sequence)를 내 다른 계좌로 옮긴다 (타사 이전 등). 매도된 행도 옮길 수 있고,
   * 그 행 하나만 바꾼다(합치거나 나누지 않음, sequence 그대로).
   * - 매수분이 없으면 404, 옮길 계좌가 내 계좌가 아니면 404
   * registerBalance·sellBalance와 같은 이유로 먼저 User 행을 잠가 같은 사용자의 변경을 순서대로 실행한다.
   */
  @Transactional()
  async updatePurchaseAccount(
    authUser: AuthUser,
    input: UpdatePurchaseAccountRequest,
  ): Promise<PurchaseDateBalance> {
    const userId = authUser.id;
    const { securityId, purchaseDate, sequence } = input;

    await this.purchaseWriter.lockOwner(userId);

    const purchase = await this.purchaseDateBalanceRepository.findOneBy({
      userId,
      securityId,
      purchaseDate,
      sequence,
    });
    if (!purchase) {
      throw new NotFoundException('수정할 매수 내역이 없습니다.');
    }
    const account = await this.accountReader.getOwned(userId, input.accountId);
    return this.purchaseWriter.moveAccount(purchase, account.id);
  }

  /**
   * 매수분 하나(종목·매수일·sequence)의 구매 환율 수정. 매도된 행도 수정할 수 있다.
   * exchangeRate는 소수 6자리 버림, null이면 저장 환율을 지운다(조회 시 매수일 환율로 계산).
   * - 매수분이 없으면 404, 종목 통화가 KRW면 400 (원화 종목은 환율을 저장하지 않음)
   * registerBalance·sellBalance와 같은 이유로 먼저 User 행을 잠가 같은 사용자의 변경을 순서대로 실행한다.
   */
  @Transactional()
  async updateExchangeRate(
    authUser: AuthUser,
    input: UpdateExchangeRateRequest,
  ): Promise<PurchaseDateBalance> {
    const userId = authUser.id;
    const { securityId, purchaseDate, sequence } = input;

    await this.purchaseWriter.lockOwner(userId);

    const purchase = await this.purchaseDateBalanceRepository.findOneBy({
      userId,
      securityId,
      purchaseDate,
      sequence,
    });
    if (!purchase) {
      throw new NotFoundException('수정할 매수 내역이 없습니다.');
    }

    const security = await this.securityRepository.findOneBy({
      id: securityId,
    });
    if (!security) {
      throw new NotFoundException('존재하지 않는 종목입니다.');
    }
    if (security.currency === Currency.KRW) {
      throw new BadRequestException('원화 종목은 구매 환율을 저장하지 않습니다.');
    }

    purchase.exchangeRate =
      input.exchangeRate === null ? null : truncateRate(input.exchangeRate);
    return this.purchaseWriter.update(purchase);
  }

  /**
   * 종목 하나의 매수 내역 (매수일 최신순, 같은 날은 sequence 역순). 매도한 매수분도 saleDate와 함께 포함.
   * 구매 환율은 USD 종목만: 매수분에 저장된 환율(exchangeRateDate null), 없으면 매수일(이전 최근) USD 종가 환율.
   * KRW 종목은 null. 종목이 없으면 404. accountId를 주면 그 계좌 매수분만, 없으면 전체 계좌.
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
    const { accountId } = input;
    const purchases = await this.purchaseDateBalanceRepository.find({
      where: {
        userId: authUser.id,
        securityId: id,
        ...(accountId !== undefined ? { accountId } : {}),
      },
      order: { purchaseDate: 'DESC', sequence: 'DESC' },
    });

    // 응답 가격은 소수 2자리까지 버림 (KRW는 원래 정수)
    const pricePlaces = Math.min(decimalPlacesOf(currency), 2);
    const rates = new Map<string, DailyExchangeRate | null>();
    const accounts = await this.accountsOf(authUser.id);
    const items: PurchaseHistoryItemDto[] = [];
    for (const purchase of purchases) {
      let exchangeRate: string | null = null;
      let exchangeRateDate: string | null = null;
      if (currency === Currency.USD) {
        if (purchase.exchangeRate != null) {
          exchangeRate = new Decimal(purchase.exchangeRate).toString();
        } else {
          const rate = await this.exchangeRateReader.findUsdOnOrBefore(
            purchase.purchaseDate,
            rates,
          );
          exchangeRate = rate ? new Decimal(rate.closingRate).toString() : null;
          exchangeRateDate = rate?.date ?? null;
        }
      }
      items.push({
        purchaseDate: purchase.purchaseDate,
        sequence: purchase.sequence,
        accountId: purchase.accountId,
        securityCompany: accounts.get(purchase.accountId)!.securityCompany,
        accountType: accounts.get(purchase.accountId)!.accountType,
        amount: truncateByCurrency(purchase.amount, currency),
        price: new Decimal(purchase.price)
          .toDecimalPlaces(pricePlaces, Decimal.ROUND_DOWN)
          .toFixed(pricePlaces),
        saleDate: purchase.saleDate,
        exchangeRate,
        exchangeRateDate,
      });
    }
    // 보유 수량 요약: 매도하지 않은 매수분만 (계좌 필터가 있으면 그 계좌만)
    const unsold = purchases.filter((purchase) => purchase.saleDate === null);
    const amount = unsold.reduce(
      (acc, purchase) => acc.plus(purchase.amount),
      new Decimal(0),
    );
    return {
      security: { id, symbol, name, currency },
      amount: truncateByCurrency(amount, currency),
      accountAmounts: accountAmountsOf(unsold, accounts, currency),
      items,
    };
  }

  /**
   * 통합잔고 조회. accountId를 주면 그 계좌의 매수분만, 없으면 전체 계좌로 계산한다.
   * 1. 보유 종목(UserBalance + Security) 2. 매도하지 않은(saleDate IS NULL) 매수일별 잔고로 종목별 총수량·총매입금액·매입평균가
   *    (미매도 매수분이 없는 종목, 즉 전량 매도한 종목은 제외)
   *    - USD 원화 매입금액은 매수분마다 저장된 구매 환율, 없으면 매수일(이전 최근) USD 환율로 환산
   * 3. 최신 종가 × 총수량 = 평가금액 4. USD 평가금액은 최신 USD 환율(closingRate, 1 USD당 원화)을 곱해 원화로 환산
   * 5. 한국(KRW)·미국(USD)·전체(원화) 합계 6. 각 항목의 수익률(%).
   *
   * 합계는 응답에 보이는 종목별 값(통화별로 버림한 값)을 더해서 행의 합과 맞춘다.
   */
  async getIntegratedBalance(
    authUser: AuthUser,
    input: IntegratedBalanceRequest = {},
  ): Promise<IntegratedBalanceResponse> {
    const userId = authUser.id;
    const { accountId } = input;

    // 1. 보유 종목 (UserBalance는 계좌별이라 종목당 하나만 남긴다)
    const userBalances = uniqueBySecurity(
      await this.userBalanceRepository.find({
        where: { userId },
        relations: { security: true },
        order: { securityId: 'ASC' },
      }),
    );
    const accounts = await this.accountsOf(userId);

    // 2. 매도하지 않은 매수일별 잔고를 종목별로 합산 (계좌를 주면 그 계좌 매수분만)
    const purchases = await this.purchaseDateBalanceRepository.find({
      where: {
        userId,
        saleDate: IsNull(),
        ...(accountId !== undefined ? { accountId } : {}),
      },
    });
    const totals = new Map<
      string,
      { amount: Decimal; cost: Decimal; krwCost: Decimal }
    >();
    for (const purchase of purchases) {
      const total = totals.get(purchase.securityId) ?? {
        amount: new Decimal(0),
        cost: new Decimal(0),
        krwCost: new Decimal(0),
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

    // USD 원화 매입금액: 매수분마다 구매 환율(저장값 → 매수일 환율)
    const usdIds = new Set(
      heldBalances
        .filter((balance) => balance.security.currency === Currency.USD)
        .map((balance) => balance.securityId),
    );
    const rateCache = new Map<string, DailyExchangeRate | null>();
    for (const purchase of purchases) {
      if (!usdIds.has(purchase.securityId)) {
        continue;
      }
      const rate = await this.purchaseRateReader.getRate(purchase, rateCache);
      const total = totals.get(purchase.securityId)!;
      total.krwCost = total.krwCost.plus(
        new Decimal(purchase.amount).times(purchase.price).times(rate),
      );
    }

    // 4. USD 종목이 있을 때만 최신 환율
    const hasUsd = heldBalances.some(
      (balance) => balance.security.currency === Currency.USD,
    );
    const exchangeRate = hasUsd
      ? await this.exchangeRateReader.findLatestUsd()
      : null;
    if (hasUsd && !exchangeRate) {
      throw new NotFoundException('USD 환율 정보가 없습니다.');
    }

    const items: BalanceItemDto[] = [];
    for (const { securityId, security } of heldBalances) {
      // 3. 최신 종가
      const latest = await this.dailyPriceReader.findLatest(securityId);
      if (!latest) {
        throw new NotFoundException(`${security.name}의 시세가 없습니다.`);
      }
      const total = totals.get(securityId)!;
      items.push(
        this.toBalanceItem(
          security,
          total.amount,
          total.cost,
          total.krwCost,
          latest.closingPrice,
          exchangeRate?.closingRate ?? null,
          accountAmountsOf(
            purchases.filter((p) => p.securityId === securityId),
            accounts,
            security.currency,
          ),
        ),
      );
    }

    // 5. 합계
    const krwItems = items.filter((item) => item.currency === Currency.KRW);
    const usdItems = items.filter((item) => item.currency === Currency.USD);
    const krwPurchase = sumDecimals(krwItems.map((i) => i.krwPurchaseAmount));
    const krwEvaluation = sumDecimals(krwItems.map((i) => i.krwEvaluationAmount));
    const usdPurchase = sumDecimals(usdItems.map((i) => i.usdPurchaseAmount));
    const usdEvaluation = sumDecimals(usdItems.map((i) => i.usdEvaluationAmount));
    const usdKrwPurchase = sumDecimals(usdItems.map((i) => i.krwPurchaseAmount));
    const usdKrwEvaluation = sumDecimals(
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

  /**
   * 종목 하나의 매입평균가·총매입금액·평가금액(원화/외화)·수익률.
   * krwCost: USD 종목의 원화 매입금액(매수분별 구매 환율로 환산한 합), usdRate: 평가에 쓰는 최신 환율
   */
  private toBalanceItem(
    security: Security,
    amount: Decimal,
    cost: Decimal,
    krwCost: Decimal,
    closingPrice: string,
    usdRate: string | null,
    accountAmounts: AccountAmountDto[],
  ): BalanceItemDto {
    const { currency } = security;
    const averagePrice = amount.isZero()
      ? new Decimal(0)
      : cost.dividedBy(amount);
    const evaluation = new Decimal(closingPrice).times(amount);

    const base = {
      securityId: security.id,
      symbol: security.symbol,
      name: security.name,
      currency,
      amount: truncateByCurrency(amount, currency),
      accountAmounts,
      currentPrice: truncateByCurrency(closingPrice, currency),
      returnRate: returnRate(cost, evaluation),
    };

    if (currency === Currency.USD) {
      const rate = new Decimal(usdRate!);
      const krwAveragePrice = amount.isZero()
        ? new Decimal(0)
        : krwCost.dividedBy(amount);
      return {
        ...base,
        krwAveragePrice: toKrw(krwAveragePrice),
        usdAveragePrice: toUsd(averagePrice),
        krwPurchaseAmount: toKrw(krwCost),
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

  /** 사용자의 계좌를 id로 찾는 Map */
  private async accountsOf(userId: number): Promise<Map<number, Account>> {
    const accounts = await this.accountReader.findByUser(userId);
    return new Map(accounts.map((account) => [account.id, account]));
  }
}

/** 계좌별 UserBalance에서 종목마다 첫 행만 남긴다 (순서 유지) */
function uniqueBySecurity(balances: UserBalance[]): UserBalance[] {
  const seen = new Set<string>();
  return balances.filter((balance) => {
    if (seen.has(balance.securityId)) {
      return false;
    }
    seen.add(balance.securityId);
    return true;
  });
}

