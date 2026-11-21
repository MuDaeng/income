import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseDateBalance } from '@app/common';

/** 사용자의 매수일별 잔고(PurchaseDateBalance) 조회 */
@Injectable()
export class PurchaseReader {
  constructor(
    @InjectRepository(PurchaseDateBalance)
    private readonly purchaseDateBalanceRepository: Repository<PurchaseDateBalance>,
  ) {}

  /** 사용자의 매수분 전부(매도분 포함). 계좌를 주면 그 계좌 매수분만 */
  findByUser(
    userId: number,
    accountId?: number,
  ): Promise<PurchaseDateBalance[]> {
    return this.purchaseDateBalanceRepository.find({
      where: { userId, ...(accountId !== undefined ? { accountId } : {}) },
    });
  }
}
