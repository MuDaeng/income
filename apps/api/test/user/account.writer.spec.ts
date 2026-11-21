import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Account,
  AccountType,
  PurchaseDateBalance,
  SecurityCompany,
  User,
} from '@app/common';
import { AccountReader } from '../../src/user/account.reader.js';
import { AccountWriter } from '../../src/user/account.writer.js';

const KIWOOM = {
  userId: 1,
  id: 2,
  securityCompany: SecurityCompany.KIWOOM,
  accountType: AccountType.ISA,
};

describe('AccountWriter.resolve', () => {
  const accountRepository = {
    find: vi.fn(),
    findOne: vi.fn(),
    findOneBy: vi.fn(),
    save: vi.fn(),
    create: vi.fn(),
  };
  const userRepository = { findOne: vi.fn() };
  let writer: AccountWriter;

  beforeEach(async () => {
    vi.resetAllMocks();
    accountRepository.create.mockImplementation((value: object) => value);
    accountRepository.save.mockImplementation((value: object) =>
      Promise.resolve(value),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        AccountWriter,
        AccountReader,
        { provide: getRepositoryToken(Account), useValue: accountRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(PurchaseDateBalance), useValue: {} },
      ],
    }).compile();
    writer = moduleRef.get(AccountWriter);
  });

  it('accountId가 있으면 내 계좌를 그대로 쓴다', async () => {
    accountRepository.findOneBy.mockResolvedValue(KIWOOM);

    await expect(writer.resolve(1, SecurityCompany.KIWOOM, 2)).resolves.toBe(KIWOOM);
    expect(accountRepository.findOneBy).toHaveBeenCalledWith({ userId: 1, id: 2 });
    expect(accountRepository.save).not.toHaveBeenCalled();
  });

  it('accountId의 계좌가 없으면 404, 증권사가 다르면 400', async () => {
    accountRepository.findOneBy.mockResolvedValue(null);
    await expect(writer.resolve(1, SecurityCompany.KIWOOM, 9)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    accountRepository.findOneBy.mockResolvedValue(KIWOOM);
    await expect(writer.resolve(1, SecurityCompany.TOSS, 2)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accountId가 없으면 그 증권사의 첫 계좌(id 순)를 쓴다', async () => {
    accountRepository.find.mockResolvedValue([KIWOOM]);

    await expect(writer.resolve(1, SecurityCompany.KIWOOM)).resolves.toBe(KIWOOM);
    expect(accountRepository.find).toHaveBeenCalledWith({
      where: { userId: 1, securityCompany: SecurityCompany.KIWOOM },
      order: { id: 'ASC' },
    });
  });

  it('그 증권사 계좌가 없으면 일반 계좌를 사용자 계좌 max + 1 id로 만든다', async () => {
    accountRepository.find.mockResolvedValue([]);
    accountRepository.findOne.mockResolvedValue(KIWOOM);

    await expect(writer.resolve(1, SecurityCompany.TOSS)).resolves.toEqual({
      userId: 1,
      id: 3,
      securityCompany: SecurityCompany.TOSS,
      accountType: AccountType.NORMAL,
    });
    expect(accountRepository.findOne).toHaveBeenCalledWith({
      where: { userId: 1 },
      order: { id: 'DESC' },
    });
  });

  it('계좌가 하나도 없으면 id 1로 만든다', async () => {
    accountRepository.find.mockResolvedValue([]);
    accountRepository.findOne.mockResolvedValue(null);

    await expect(writer.resolve(1, SecurityCompany.TOSS)).resolves.toMatchObject({
      id: 1,
    });
  });

  it('create는 지정한 타입으로 max + 1 id 계좌를 만든다', async () => {
    accountRepository.findOne.mockResolvedValue(KIWOOM);

    await expect(
      writer.create(1, SecurityCompany.SAMSUNG, AccountType.IRP),
    ).resolves.toEqual({
      userId: 1,
      id: 3,
      securityCompany: SecurityCompany.SAMSUNG,
      accountType: AccountType.IRP,
    });
  });

  it('lockOwner는 User 행을 비관적 쓰기 잠금으로 읽는다', async () => {
    await writer.lockOwner(7);

    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: { id: 7 },
      lock: { mode: 'pessimistic_write' },
    });
  });
});
