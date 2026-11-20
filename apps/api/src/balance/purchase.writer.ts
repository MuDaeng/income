import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { In, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import {
  type Currency,
  PurchaseDateBalance,
  type SecurityCompany,
  truncateByCurrency,
  User,
  UserBalance,
} from '@app/common';

/** sequence를 뺀 새 매수분 값 (sequence는 append가 매긴다) */
export type NewPurchase = Pick<
  PurchaseDateBalance,
  | 'userId'
  | 'securityId'
  | 'purchaseDate'
  | 'securityCompany'
  | 'amount'
  | 'price'
  | 'saleDate'
  | 'exchangeRate'
>;

/**
 * 매수일별 잔고(PurchaseDateBalance)와 보유 종목(UserBalance) 쓰기.
 * 모든 메서드는 Service의 @Transactional() 메서드 안에서, lockOwner로 User 행을 잠근 뒤에 부른다.
 * 같은 사용자의 변경이 순서대로 실행되어야 sequence(max + 1)와 UserBalance가 중복되지 않는다.
 * PK로 찾는 단일 행 잠금이라 gap lock이 없어서 deadlock이 나지 않는다
 * (매수일별 잔고 행 자체를 잠그면 InnoDB gap lock 때문에 동시 저장끼리 deadlock이 난다).
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

  /** 매수분 등록: UserBalance가 없으면 만들고, sequence = 같은 사용자·종목·매수일 안의 max + 1로 저장 */
  async append(purchase: NewPurchase): Promise<PurchaseDateBalance> {
    const { userId, securityId } = purchase;
    const userBalance = await this.userBalanceRepository.findOneBy({
      userId,
      securityId,
    });
    if (!userBalance) {
      await this.userBalanceRepository.save(
        this.userBalanceRepository.create({ userId, securityId }),
      );
    }
    return this.saveWithNextSequence(purchase);
  }

  /**
   * 미매도 매수분 하나(source)에서 amount(≤ 보유 수량)만큼 saleDate로 매도 처리한다.
   * - 전량: 같은 매도일·매수가·환율·증권사의 매도 행이 있으면 거기에 더하고 미매도 행은 삭제, 없으면 미매도 행에 saleDate만 저장
   * - 일부: 미매도 행에서 빼고, 같은 매도 행이 있으면 거기에 더하고,
   *   없으면 새 행(매수가·환율·증권사는 미매도 행 값, sequence는 같은 매수일 안의 max + 1)을 저장
   * 매도 처리된 행(saleDate가 찍힌 행, 합쳐진 행 또는 새 매도 행)을 돌려준다.
   */
  async sell(
    source: PurchaseDateBalance,
    amount: Decimal,
    saleDate: string,
    currency: Currency,
  ): Promise<PurchaseDateBalance> {
    const { userId, securityId, purchaseDate, sequence } = source;
    const held = new Decimal(source.amount);

    // 매수가·구매 환율·증권사까지 같은 매도 행만 합친다
    const sold = await this.purchaseDateBalanceRepository.findOne({
      where: {
        userId,
        securityId,
        purchaseDate,
        saleDate,
        price: source.price,
        exchangeRate: source.exchangeRate ?? IsNull(),
        securityCompany: source.securityCompany,
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
      securityId,
      purchaseDate,
      securityCompany: source.securityCompany,
      amount: truncateByCurrency(amount, currency),
      price: source.price,
      saleDate,
      exchangeRate: source.exchangeRate,
    });
  }

  /**
   * 증권사별 LIFO 매도. 그 증권사의 미매도 매수분 중 매도일 이전(포함)에 산 것을
   * 매수일이 최근인 순(같은 날은 sequence 큰 순)으로 amount만큼 sell 한다.
   * 대상 보유 수량 합계 < amount면 400 (아무것도 매도하지 않음). 매도 처리된 행을 처리 순서대로 돌려준다.
   */
  async sellLifo(
    userId: number,
    securityId: string,
    securityCompany: SecurityCompany,
    amount: Decimal,
    saleDate: string,
    currency: Currency,
  ): Promise<PurchaseDateBalance[]> {
    const sources = await this.purchaseDateBalanceRepository.find({
      where: {
        userId,
        securityId,
        securityCompany,
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

  /**
   * 사용자의 한 증권사 매수분(매도분 포함)을 모두 삭제한다. 지운 행 수를 돌려준다.
   * 매수분이 하나도 남지 않은 종목은 UserBalance도 지운다(remove와 같은 규칙).
   */
  async removeByCompany(
    userId: number,
    securityCompany: SecurityCompany,
  ): Promise<number> {
    const rows = await this.purchaseDateBalanceRepository.find({
      where: { userId, securityCompany },
      select: { securityId: true },
    });
    if (rows.length === 0) {
      return 0;
    }
    const { affected } = await this.purchaseDateBalanceRepository.delete({
      userId,
      securityCompany,
    });

    const securityIds = [...new Set(rows.map((row) => row.securityId))];
    const remaining = await this.purchaseDateBalanceRepository.find({
      where: { userId, securityId: In(securityIds) },
      select: { securityId: true },
    });
    const kept = new Set(remaining.map((row) => row.securityId));
    const emptied = securityIds.filter((id) => !kept.has(id));
    if (emptied.length > 0) {
      await this.userBalanceRepository.delete({
        userId,
        securityId: In(emptied),
      });
    }
    return affected ?? rows.length;
  }

  /** 매수분 하나의 변경(증권사·구매 환율 등)을 저장한다. 합치거나 나누지 않는다 */
  update(purchase: PurchaseDateBalance): Promise<PurchaseDateBalance> {
    return this.purchaseDateBalanceRepository.save(purchase);
  }

  /**
   * 매수분 하나(종목·매수일·sequence) 삭제. 지운 행이 없으면 false.
   * 그 종목의 매수분이 하나도 남지 않으면 UserBalance도 지운다. 다른 매수분의 sequence는 다시 매기지 않는다.
   */
  async remove(
    key: Pick<PurchaseDateBalance, 'userId' | 'securityId' | 'purchaseDate' | 'sequence'>,
  ): Promise<boolean> {
    const { userId, securityId, purchaseDate, sequence } = key;
    const { affected } = await this.purchaseDateBalanceRepository.delete({
      userId,
      securityId,
      purchaseDate,
      sequence,
    });
    if (!affected) {
      return false;
    }
    const remaining = await this.purchaseDateBalanceRepository.existsBy({
      userId,
      securityId,
    });
    if (!remaining) {
      await this.userBalanceRepository.delete({ userId, securityId });
    }
    return true;
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
