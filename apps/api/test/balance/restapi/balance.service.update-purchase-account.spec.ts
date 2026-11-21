import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  DailyExchangeRate,
  DailySecurity,
  PurchaseDateBalance,
  Security,
  User,
  UserBalance,
} from '@app/common';
import { SecurityRefresher } from '../../../src/security/security.refresher.js';
import { accountProviders } from '../account-providers.js';
import { BalanceService } from '../../../src/balance/restapi/balance.service.js';
import { PurchaseRateReader } from '../../../src/balance/purchase-rate.reader.js';
import { PurchaseWriter } from '../../../src/balance/purchase.writer.js';
import { DailyPriceReader } from '../../../src/security/daily-price.reader.js';
import { ExchangeRateReader } from '../../../src/security/exchange-rate.reader.js';
import { AccountReader } from '../../../src/user/account.reader.js';

// 단위 테스트에서는 트랜잭션 컨텍스트 없이 메서드만 실행
vi.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

const KEY = { securityId: 'KR7005930003', purchaseDate: '2026-11-05', sequence: 2 };
const ROW = {
  userId: 1,
  accountId: 1,
  ...KEY,
  amount: '10.000000',
  price: '70000.000000',
  saleDate: null,
  exchangeRate: null,
};

describe('BalanceService.updatePurchaseAccount', () => {
  const purchaseDateBalanceRepository = {
    findOneBy: vi.fn(),
    update: vi.fn(),
    existsBy: vi.fn(),
  };
  const userBalanceRepository = {
    existsBy: vi.fn(),
    save: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  };
  const userRepository = { findOne: vi.fn() };
  let service: BalanceService;
  let accountReader: AccountReader;

  beforeEach(async () => {
    vi.resetAllMocks();
    userRepository.findOne.mockResolvedValue({ id: 1 });
    purchaseDateBalanceRepository.findOneBy.mockResolvedValue({ ...ROW });
    userBalanceRepository.existsBy.mockResolvedValue(true);
    purchaseDateBalanceRepository.existsBy.mockResolvedValue(true);

    const moduleRef = await Test.createTestingModule({
      providers: [
        BalanceService,
        DailyPriceReader,
        ExchangeRateReader,
        PurchaseRateReader,
        PurchaseWriter,
        ...accountProviders(),
        {
          provide: getRepositoryToken(PurchaseDateBalance),
          useValue: purchaseDateBalanceRepository,
        },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Security), useValue: {} },
        { provide: SecurityRefresher, useValue: {} },
        {
          provide: getRepositoryToken(UserBalance),
          useValue: userBalanceRepository,
        },
        { provide: getRepositoryToken(DailySecurity), useValue: {} },
        { provide: getRepositoryToken(DailyExchangeRate), useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(BalanceService);
    accountReader = moduleRef.get(AccountReader);
  });

  it('User 행을 잠근 뒤 매수분 하나를 내 다른 계좌로 옮긴다 (sequence 그대로)', async () => {
    const result = await service.updatePurchaseAccount(
      { id: 1, rules: [] },
      { ...KEY, accountId: 2 },
    );

    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: { id: 1 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(purchaseDateBalanceRepository.update).toHaveBeenCalledWith(
      { userId: 1, accountId: 1, ...KEY },
      { accountId: 2 },
    );
    expect(result).toEqual({ ...ROW, accountId: 2 });
  });

  it('매수분이 없으면 404, 옮기지 않는다', async () => {
    purchaseDateBalanceRepository.findOneBy.mockResolvedValue(null);

    await expect(
      service.updatePurchaseAccount({ id: 1, rules: [] }, { ...KEY, accountId: 2 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(purchaseDateBalanceRepository.update).not.toHaveBeenCalled();
  });

  it('옮길 계좌가 내 계좌가 아니면 404, 옮기지 않는다', async () => {
    vi.spyOn(accountReader, 'getOwned').mockRejectedValue(
      new NotFoundException('존재하지 않는 계좌입니다.'),
    );

    await expect(
      service.updatePurchaseAccount({ id: 1, rules: [] }, { ...KEY, accountId: 9 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(purchaseDateBalanceRepository.update).not.toHaveBeenCalled();
  });
});
