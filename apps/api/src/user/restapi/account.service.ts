import { BadRequestException, Injectable } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import type { Account } from '@app/common';
import type { AuthUser } from '../../auth/restapi/jwt.strategy.js';
import { AccountReader } from '../account.reader.js';
import { AccountWriter } from '../account.writer.js';
import type { AccountDto, AccountListResponse } from './dto/account.dto.js';
import type { AccountListRequest } from './dto/account-list.schema.js';
import type { CreateAccountRequest } from './dto/create-account.schema.js';
import type {
  AccountIdParam,
  UpdateAccountTypeRequest,
} from './dto/update-account-type.schema.js';

@Injectable()
export class AccountService {
  constructor(
    private readonly accountReader: AccountReader,
    private readonly accountWriter: AccountWriter,
  ) {}

  /** 내 계좌 목록 (id 순). securityCompany를 주면 그 증권사 계좌만 */
  async getAccounts(
    authUser: AuthUser,
    input: AccountListRequest,
  ): Promise<AccountListResponse> {
    const accounts = await this.accountReader.findByUser(
      authUser.id,
      input.securityCompany,
    );
    return { accounts: accounts.map(toAccountDto) };
  }

  /** 계좌 생성. id는 내 계좌 중 max + 1 (User 행을 잠가 동시 생성 시 중복 방지) */
  @Transactional()
  async createAccount(
    authUser: AuthUser,
    input: CreateAccountRequest,
  ): Promise<AccountDto> {
    await this.accountWriter.lockOwner(authUser.id);
    return toAccountDto(
      await this.accountWriter.create(
        authUser.id,
        input.securityCompany,
        input.accountType,
      ),
    );
  }

  /**
   * 내 계좌 삭제. 내 계좌가 아니면 404, 매수 내역(매도분 포함)이 남아 있으면 400
   * (외래키가 CASCADE라 그대로 지우면 매수 내역까지 사라지므로, 먼저 다른 계좌로 옮기거나 삭제해야 한다)
   */
  @Transactional()
  async deleteAccount(authUser: AuthUser, param: AccountIdParam): Promise<void> {
    const account = await this.accountReader.getOwned(authUser.id, param.id);
    if (await this.accountReader.hasPurchases(authUser.id, account.id)) {
      throw new BadRequestException(
        '매수 내역이 남아 있는 계좌는 삭제할 수 없습니다. 다른 계좌로 옮기거나 삭제한 뒤 다시 시도해 주세요.',
      );
    }
    await this.accountWriter.remove(account);
  }

  /** 내 계좌 하나의 타입 변경. 내 계좌가 아니면 404 */
  async updateAccountType(
    authUser: AuthUser,
    param: AccountIdParam,
    input: UpdateAccountTypeRequest,
  ): Promise<AccountDto> {
    const account = await this.accountReader.getOwned(authUser.id, param.id);
    return toAccountDto(
      await this.accountWriter.updateType(account, input.accountType),
    );
  }
}

function toAccountDto({ id, securityCompany, accountType }: Account): AccountDto {
  return { id, securityCompany, accountType };
}
