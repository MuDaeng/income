import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import {
  type Currency,
  PurchaseDateBalance,
  truncateByCurrency,
  User,
  UserBalance,
} from '@app/common';

/** sequence를 뺀 새 매수분 값 (sequence는 append가 매긴다) */
export type NewPurchase = Pick<
  PurchaseDateBalance,
  | 'userId'
  | 'accountId'
  | 'securityId'
  | 'purchaseDate'
  | 'amount'
  | 'price'
  | 'saleDate'
  | 'exchangeRate'
>;

/**
 * 매수일별 잔고(PurchaseDateBalance)와 보유 종목(UserBalance, 계좌별) 쓰기.
 * 모든 메서드는 Service의 @Transactional() 메서드 안에서, lockOwner로 User 행을 잠근 뒤에 부른다.
 * 같은 사용자의 변경이 순서대로 실행되어야 sequence(max + 1)와 UserBalance가 중복되지 않는다.
 * PK로 찾는 단일 행 잠금이라 gap lock이 없어서 deadlock이 나지 않는다
 * (매수일별 잔고 행 자체를 잠그면 InnoDB gap lock 때문에 동시 저장끼리 deadlock이 난다).
 *
 * sequence는 계좌와 상관없이 같은 사용자·종목·매수일 안에서 매긴다. 그래서 (종목·매수일·sequence)만으로
 * 매수분 하나가 정해지고, 계좌를 옮겨도 sequence가 바뀌지 않는다.
 */
@Injectable()
export class PurchaseWriter {
  constructor(
    @InjectRepository(PurchaseDateBalance)
    private readonly purchaseDateBalanceRepository: Repository<PurchaseDateBalance>,
    @InjectRepository(UserBalance)
    private readonly userBalanceRepository: Repository<UserBalance>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /** User 행을 잠근다(SELECT ... FOR UPDATE). 사용자가 없으면 401 */
  async lockOwner(userId: number): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user) {
      throw new UnauthorizedException('존재하지 않는 사용자입니다.');
    }
  }

  /** 매수분 등록: 그 계좌의 UserBalance가 없으면 만들고, sequence = 같은 사용자·종목·매수일 안의 max + 1로 저장 */
  async append(purchase: NewPurchase): Promise<PurchaseDateBalance> {
    const { userId, accountId, securityId } = purchase;
    await this.ensureUserBalance(userId, accountId, securityId);
    return this.saveWithNextSequence(purchase);
  }

  /**
   * 미매도 매수분 하나(source)에서 amount(≤ 보유 수량)만큼 saleDate로 매도 처리한다.
   * - 전량: 같은 매도일·매수가·환율·계좌의 매도 행이 있으면 거기에 더하고 미매도 행은 삭제, 없으면 미매도 행에 saleDate만 저장
   * - 일부: 미매도 행에서 빼고, 같은 매도 행이 있으면 거기에 더하고,
   *   없으면 새 행(매수가·환율·계좌는 미매도 행 값, sequence는 같은 매수일 안의 max + 1)을 저장
   * 매도 처리된 행(saleDate가 찍힌 행, 합쳐진 행 또는 새 매도 행)을 돌려준다.
   */
  async sell(
    source: PurchaseDateBalance,
    amount: Decimal,
    saleDate: string,
    currency: Currency,
  ): Promise<PurchaseDateBalance> {
    const { userId, accountId, securityId, purchaseDate, sequence } = source;
    const held = new Decimal(source.amount);

    // 매수가·구매 환율·계좌까지 같은 매도 행만 합친다
    const sold = await this.purchaseDateBalanceRepository.findOne({
      where: {
        userId,
        accountId,
        securityId,
        purchaseDate,
        saleDate,
        price: source.price,
        exchangeRate: source.exchangeRate ?? IsNull(),
      },
    });

    // 전량 매도
    if (amount.eq(held)) {
      if (!sold) {
        source.saleDate = saleDate;
        return this.purchaseDateBalanceRepository.save(source);
      }
      sold.amount = truncateByCurrency(amount.plus(sold.amount), currency);
      await this.purchaseDateBalanceRepository.delete({
        userId,
        accountId,
        securityId,
        purchaseDate,
        sequence,
      });
      return this.purchaseDateBalanceRepository.save(sold);
    }

    // 일부 매도
    source.amount = truncateByCurrency(held.minus(amount), currency);
    await this.purchaseDateBalanceRepository.save(source);

    // 같은 매도일 행에 더함
    if (sold) {
      sold.amount = truncateByCurrency(amount.plus(sold.amount), currency);
      return this.purchaseDateBalanceRepository.save(sold);
    }

    // 새 매도 행
    return this.saveWithNextSequence({
      userId,
      accountId,
      securityId,
      purchaseDate,
      amount: truncateByCurrency(amount, currency),
      price: source.price,
      saleDate,
      exchangeRate: source.exchangeRate,
    });
  }

  /**
   * 계좌별 LIFO 매도. 그 계좌의 미매도 매수분 중 매도일 이전(포함)에 산 것을
   * 매수일이 최근인 순(같은 날은 sequence 큰 순)으로 amount만큼 sell 한다.
   * 대상 보유 수량 합계 < amount면 400 (아무것도 매도하지 않음). 매도 처리된 행을 처리 순서대로 돌려준다.
   */
  async sellLifo(
    userId: number,
    accountId: number,
    securityId: string,
    amount: Decimal,
    saleDate: string,
    currency: Currency,
  ): Promise<PurchaseDateBalance[]> {
    const sources = await this.purchaseDateBalanceRepository.find({
      where: {
        userId,
        accountId,
        securityId,
        saleDate: IsNull(),
        purchaseDate: LessThanOrEqual(saleDate),
      },
      order: { purchaseDate: 'DESC', sequence: 'DESC' },
    });
    const held = sources.reduce(
      (acc, source) => acc.plus(source.amount),
      new Decimal(0),
    );
    if (amount.gt(held)) {
      throw new BadRequestException('매도 수량이 보유 수량보다 많습니다.');
    }

    const results: PurchaseDateBalance[] = [];
    let remaining = amount;
    for (const source of sources) {
      if (remaining.lte(0)) {
        break;
      }
      const portion = Decimal.min(remaining, source.amount);
      results.push(await this.sell(source, portion, saleDate, currency));
      remaining = remaining.minus(portion);
    }
    return results;
  }

  /** 계좌 하나의 매수분(매도분 포함)과 보유 종목(UserBalance)을 모두 삭제한다. 지운 매수분 수를 돌려준다 */
  async removeByAccount(userId: number, accountId: number): Promise<number> {
    const { affected } = await this.purchaseDateBalanceRepository.delete({
      userId,
      accountId,
    });
    await this.userBalanceRepository.delete({ userId, accountId });
    return affected ?? 0;
  }

  /**
   * 매수분 하나를 다른 계좌로 옮긴다 (합치거나 나누지 않음, sequence 그대로).
   * 옮길 계좌의 UserBalance가 없으면 만들고, 원래 계좌에 그 종목 매수분이 남지 않으면 원래 UserBalance를 지운다.
   */
  async moveAccount(
    purchase: PurchaseDateBalance,
    accountId: number,
  ): Promise<PurchaseDateBalance> {
    const { userId, securityId, purchaseDate, sequence } = purchase;
    const from = purchase.accountId;
    if (from === accountId) {
      return purchase;
    }
    await this.ensureUserBalance(userId, accountId, securityId);
    // accountId는 PK라 save로 바꾸면 새 행이 생기므로 update로 바꾼다
    await this.purchaseDateBalanceRepository.update(
      { userId, accountId: from, securityId, purchaseDate, sequence },
      { accountId },
    );
    await this.removeEmptyUserBalance(userId, from, securityId);
    purchase.accountId = accountId;
    return purchase;
  }

  /** 매수분 하나의 변경(구매 환율 등 PK가 아닌 컬럼)을 저장한다. 합치거나 나누지 않는다 */
  update(purchase: PurchaseDateBalance): Promise<PurchaseDateBalance> {
    return this.purchaseDateBalanceRepository.save(purchase);
  }

  /**
   * 매수분 하나(종목·매수일·sequence) 삭제. 지운 행이 없으면 false.
   * 그 계좌에 그 종목 매수분이 하나도 남지 않으면 UserBalance도 지운다. 다른 매수분의 sequence는 다시 매기지 않는다.
   */
  async remove(
    key: Pick<
      PurchaseDateBalance,
      'userId' | 'securityId' | 'purchaseDate' | 'sequence'
    >,
  ): Promise<boolean> {
    const purchase = await this.purchaseDateBalanceRepository.findOneBy(key);
    if (!purchase) {
      return false;
    }
    const { userId, accountId, securityId } = purchase;
    await this.purchaseDateBalanceRepository.delete({ ...key, accountId });
    await this.removeEmptyUserBalance(userId, accountId, securityId);
    return true;
  }

  private async ensureUserBalance(
    userId: number,
    accountId: number,
    securityId: string,
  ): Promise<void> {
    const exists = await this.userBalanceRepository.existsBy({
      userId,
      accountId,
      securityId,
    });
    if (!exists) {
      await this.userBalanceRepository.save(
        this.userBalanceRepository.create({ userId, accountId, securityId }),
      );
    }
  }

  /** 그 계좌에 그 종목 매수분이 남지 않았으면 UserBalance를 지운다 */
  private async removeEmptyUserBalance(
    userId: number,
    accountId: number,
    securityId: string,
  ): Promise<void> {
    const remaining = await this.purchaseDateBalanceRepository.existsBy({
      userId,
      accountId,
      securityId,
    });
    if (!remaining) {
      await this.userBalanceRepository.delete({
        userId,
        accountId,
        securityId,
      });
    }
  }

  private async saveWithNextSequence(
    purchase: NewPurchase,
  ): Promise<PurchaseDateBalance> {
    const { userId, securityId, purchaseDate } = purchase;
    const last = await this.purchaseDateBalanceRepository.findOne({
      where: { userId, securityId, purchaseDate },
      order: { sequence: 'DESC' },
    });
    return this.purchaseDateBalanceRepository.save(
      this.purchaseDateBalanceRepository.create({
        ...purchase,
        sequence: (last?.sequence ?? 0) + 1,
      }),
    );
  }
}
