import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { PurchaseDateBalance, User } from '@app/common';

export interface AddPurchaseDateBalanceInput {
  userId: number;
  securityId: string;
  /** 'YYYY-MM-DD' */
  purchaseDate: string;
  amount: number;
  price: number;
}

@Injectable()
export class BalanceService {
  constructor(
    @InjectRepository(PurchaseDateBalance)
    private readonly purchaseDateBalanceRepository: Repository<PurchaseDateBalance>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * 매수일별 잔고를 저장. sequence는 같은 (userId, securityId, purchaseDate) 안의 max + 1.
   *
   * 동시 저장 시 같은 sequence가 나오지 않도록 먼저 해당 User 행을 잠근다(SELECT ... FOR UPDATE).
   * PK로 찾는 단일 행 잠금이라 gap lock이 없어서, 같은 사용자의 저장은 순서대로 실행되고 deadlock이 나지 않는다.
   * (매수일별 잔고 행 자체를 잠그면 InnoDB gap lock 때문에 동시 저장끼리 deadlock이 난다)
   */
  @Transactional()
  async addPurchaseDateBalance(
    input: AddPurchaseDateBalanceInput,
  ): Promise<PurchaseDateBalance> {
    const { userId, securityId, purchaseDate } = input;

    const user = await this.userRepository.findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user) {
      throw new NotFoundException('존재하지 않는 사용자입니다.');
    }

    const last = await this.purchaseDateBalanceRepository.findOne({
      where: { userId, securityId, purchaseDate },
      order: { sequence: 'DESC' },
    });

    return this.purchaseDateBalanceRepository.save(
      this.purchaseDateBalanceRepository.create({
        ...input,
        sequence: (last?.sequence ?? 0) + 1,
      }),
    );
  }
}
