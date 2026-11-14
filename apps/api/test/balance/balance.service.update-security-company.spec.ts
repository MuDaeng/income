import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  DailyExchangeRate,
  DailySecurity,
  PurchaseDateBalance,
  Security,
  SecurityCompany,
  User,
  UserBalance,
} from '@app/common';
import { SecurityRefreshService } from '../../src/security/security-refresh.service.js';
import { BalanceService } from '../../src/balance/balance.service.js';

// 단위 테스트에서는 트랜잭션 컨텍스트 없이 메서드만 실행
vi.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

const KEY = { securityId: 'KR7005930003', purchaseDate: '2026-11-05', sequence: 2 };
const ROW = {
  userId: 1,
  ...KEY,
  securityCompany: SecurityCompany.MIRAE_ASSET,
  amount: '10.000000',
  price: '70000.000000',
  saleDate: null,
  exchangeRate: null,
};

describe('BalanceService.updateSecurityCompany', () => {
  const purchaseDateBalanceRepository = { findOneBy: vi.fn(), save: vi.fn() };
  const userRepository = { findOne: vi.fn() };
  let service: BalanceService;

  beforeEach(async () => {
    vi.resetAllMocks();
    userRepository.findOne.mockResolvedValue({ id: 1 });
    purchaseDateBalanceRepository.findOneBy.mockResolvedValue({ ...ROW });
    purchaseDateBalanceRepository.save.mockImplementation((row: object) =>
      Promise.resolve(row),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        BalanceService,
        {
          provide: getRepositoryToken(PurchaseDateBalance),
          useValue: purchaseDateBalanceRepository,
        },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Security), useValue: {} },
        { provide: SecurityRefreshService, useValue: {} },
        { provide: getRepositoryToken(UserBalance), useValue: {} },
        { provide: getRepositoryToken(DailySecurity), useValue: {} },
        { provide: getRepositoryToken(DailyExchangeRate), useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(BalanceService);
  });

  it('User 행을 잠근 뒤 로그인 사용자의 매수분 증권사만 바꿔 저장한다', async () => {
    const result = await service.updateSecurityCompany(
      { id: 1 },
      { ...KEY, securityCompany: SecurityCompany.KIWOOM },
    );

    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: { id: 1 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(purchaseDateBalanceRepository.findOneBy).toHaveBeenCalledWith({
      userId: 1,
      ...KEY,
    });
    expect(result).toEqual({ ...ROW, securityCompany: SecurityCompany.KIWOOM });
  });

  it('매도된 매수분도 수정한다', async () => {
    purchaseDateBalanceRepository.findOneBy.mockResolvedValue({
      ...ROW,
      saleDate: '2026-11-10',
    });

    const result = await service.updateSecurityCompany(
      { id: 1 },
      { ...KEY, securityCompany: SecurityCompany.TOSS },
    );

    expect(result).toMatchObject({
      saleDate: '2026-11-10',
      securityCompany: SecurityCompany.TOSS,
    });
  });

  it('매수분이 없으면 404, 저장하지 않는다', async () => {
    purchaseDateBalanceRepository.findOneBy.mockResolvedValue(null);

    await expect(
      service.updateSecurityCompany(
        { id: 1 },
        { ...KEY, securityCompany: SecurityCompany.KIWOOM },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(purchaseDateBalanceRepository.save).not.toHaveBeenCalled();
  });
});
