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
  DailySecurity,
  PurchaseDateBalance,
  Security,
  truncateByCurrency,
  User,
  UserBalance,
} from '@app/common';
import type { AuthUser } from '../auth/jwt.strategy.js';
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
}
