import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Account,
  PurchaseDateBalance,
  type SecurityCompany,
} from '@app/common';

/** 사용자의 계좌(Account) 조회 */
@Injectable()
export class AccountReader {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectRepository(PurchaseDateBalance)
    private readonly purchaseDateBalanceRepository: Repository<PurchaseDateBalance>,
  ) {}

  /** 계좌에 매수 내역(매도분 포함)이 한 건이라도 있는지 */
  hasPurchases(userId: number, accountId: number): Promise<boolean> {
    return this.purchaseDateBalanceRepository.existsBy({ userId, accountId });
  }

  /** 사용자의 계좌 목록 (id 순). 증권사를 주면 그 증권사 계좌만 */
  findByUser(
    userId: number,
    securityCompany?: SecurityCompany,
  ): Promise<Account[]> {
    return this.accountRepository.find({
      where: { userId, ...(securityCompany ? { securityCompany } : {}) },
      order: { id: 'ASC' },
    });
  }

  /** 사용자의 계좌 하나. 없거나 다른 사용자의 계좌면 404 */
  async getOwned(userId: number, id: number): Promise<Account> {
    const account = await this.accountRepository.findOneBy({ userId, id });
    if (!account) {
      throw new NotFoundException('존재하지 않는 계좌입니다.');
    }
    return account;
  }
}
