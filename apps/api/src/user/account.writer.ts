import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account, AccountType, type SecurityCompany, User } from '@app/common';
import { AccountReader } from './account.reader.js';

/**
 * 계좌(Account) 쓰기. resolve·create는 Service의 @Transactional() 메서드 안에서
 * User 행을 잠근 뒤(lockOwner 또는 PurchaseWriter.lockOwner)에 불러야 id(사용자별 max + 1)가 중복되지 않는다.
 */
@Injectable()
export class AccountWriter {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly accountReader: AccountReader,
  ) {}

  /** 같은 사용자의 계좌 채번이 동시에 일어나지 않도록 User 행을 잠근다 */
  async lockOwner(userId: number): Promise<void> {
    await this.userRepository.findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /** 계좌 생성 (id = 사용자 계좌 중 max + 1) */
  async create(
    userId: number,
    securityCompany: SecurityCompany,
    accountType: AccountType,
  ): Promise<Account> {
    const last = await this.accountRepository.findOne({
      where: { userId },
      order: { id: 'DESC' },
    });
    return this.accountRepository.save(
      this.accountRepository.create({
        userId,
        id: (last?.id ?? 0) + 1,
        securityCompany,
        accountType,
      }),
    );
  }

  /**
   * 매수·매도에 쓸 계좌를 정한다.
   * - accountId가 있으면 그 계좌 (내 계좌가 아니면 404, 증권사가 다르면 400)
   * - 없으면 그 증권사의 내 계좌 중 id가 가장 작은 것
   * - 그것도 없으면 일반(NORMAL) 계좌를 새로 만든다 (id = 사용자 계좌 중 max + 1)
   */
  async resolve(
    userId: number,
    securityCompany: SecurityCompany,
    accountId?: number,
  ): Promise<Account> {
    if (accountId !== undefined) {
      const account = await this.accountReader.getOwned(userId, accountId);
      if (account.securityCompany !== securityCompany) {
        throw new BadRequestException(
          '계좌의 증권사가 입력한 증권사와 다릅니다.',
        );
      }
      return account;
    }
    const [existing] = await this.accountReader.findByUser(
      userId,
      securityCompany,
    );
    if (existing) {
      return existing;
    }
    return this.create(userId, securityCompany, AccountType.NORMAL);
  }

  /** 계좌 삭제 */
  async remove(account: Account): Promise<void> {
    await this.accountRepository.delete({
      userId: account.userId,
      id: account.id,
    });
  }

  /** 계좌 타입 변경 */
  updateType(account: Account, accountType: AccountType): Promise<Account> {
    account.accountType = accountType;
    return this.accountRepository.save(account);
  }
}
