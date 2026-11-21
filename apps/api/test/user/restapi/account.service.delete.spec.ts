import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Account, AccountType, PurchaseDateBalance, SecurityCompany, User } from '@app/common';
import { AccountReader } from '../../../src/user/account.reader.js';
import { AccountWriter } from '../../../src/user/account.writer.js';
import { AccountService } from '../../../src/user/restapi/account.service.js';

vi.mock('typeorm-transactional', () => ({
  Transactional: () => () => {},
}));

const TOSS = {
  userId: 6,
  id: 2,
  securityCompany: SecurityCompany.TOSS,
  accountType: AccountType.NORMAL,
};

describe('AccountService.deleteAccount', () => {
  const accountRepository = { findOneBy: vi.fn(), delete: vi.fn() };
  const purchaseDateBalanceRepository = { existsBy: vi.fn() };
  let service: AccountService;

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AccountService,
        AccountReader,
        AccountWriter,
        { provide: getRepositoryToken(Account), useValue: accountRepository },
        { provide: getRepositoryToken(PurchaseDateBalance), useValue: purchaseDateBalanceRepository },
        { provide: getRepositoryToken(User), useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(AccountService);
  });

  it('매수 내역이 없는 내 계좌를 지운다', async () => {
    accountRepository.findOneBy.mockResolvedValue(TOSS);
    purchaseDateBalanceRepository.existsBy.mockResolvedValue(false);

    await service.deleteAccount({ id: 6, rules: [] }, { id: 2 });

    expect(accountRepository.findOneBy).toHaveBeenCalledWith({ userId: 6, id: 2 });
    expect(purchaseDateBalanceRepository.existsBy).toHaveBeenCalledWith({ userId: 6, accountId: 2 });
    expect(accountRepository.delete).toHaveBeenCalledWith({ userId: 6, id: 2 });
  });

  it('매수 내역(매도분 포함)이 남아 있으면 400, 지우지 않는다', async () => {
    accountRepository.findOneBy.mockResolvedValue(TOSS);
    purchaseDateBalanceRepository.existsBy.mockResolvedValue(true);

    await expect(service.deleteAccount({ id: 6, rules: [] }, { id: 2 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(accountRepository.delete).not.toHaveBeenCalled();
  });

  it('내 계좌가 아니면 404', async () => {
    accountRepository.findOneBy.mockResolvedValue(null);

    await expect(service.deleteAccount({ id: 6, rules: [] }, { id: 9 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(accountRepository.delete).not.toHaveBeenCalled();
  });
});
