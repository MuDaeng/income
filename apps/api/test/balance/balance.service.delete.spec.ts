import { NotFoundException, UnauthorizedException } from '@nestjs/common';
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
import { SecurityRefreshService } from '../../src/security/security-refresh.service.js';
import { BalanceService } from '../../src/balance/balance.service.js';

// 단위 테스트에서는 트랜잭션 컨텍스트 없이 메서드만 실행
vi.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

const input = {
  securityId: '005930',
  purchaseDate: '2026-11-05',
  sequence: 2,
};

describe('BalanceService.deletePurchase', () => {
  const purchaseDateBalanceRepository = { delete: vi.fn(), existsBy: vi.fn() };
  const userBalanceRepository = { delete: vi.fn() };
  const userRepository = { findOne: vi.fn() };
  let service: BalanceService;

  beforeEach(async () => {
    vi.resetAllMocks();
    userRepository.findOne.mockResolvedValue({ id: 1 });
    purchaseDateBalanceRepository.delete.mockResolvedValue({ affected: 1 });

    const moduleRef = await Test.createTestingModule({
      providers: [
        BalanceService,
        {
          provide: getRepositoryToken(PurchaseDateBalance),
          useValue: purchaseDateBalanceRepository,
        },
        {
          provide: getRepositoryToken(UserBalance),
          useValue: userBalanceRepository,
        },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: SecurityRefreshService, useValue: {} },
        { provide: getRepositoryToken(Security), useValue: {} },
        { provide: getRepositoryToken(DailySecurity), useValue: {} },
        { provide: getRepositoryToken(DailyExchangeRate), useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(BalanceService);
  });

  it('User 행을 잠근 뒤 로그인 사용자의 (종목, 매수일, sequence) 행만 삭제한다', async () => {
    purchaseDateBalanceRepository.existsBy.mockResolvedValue(true);

    await service.deletePurchase({ id: 1 }, input);

    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: { id: 1 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(purchaseDateBalanceRepository.delete).toHaveBeenCalledWith({
      userId: 1,
      ...input,
    });
  });

  it('같은 종목의 매수분이 남아 있으면 UserBalance는 그대로 둔다', async () => {
    purchaseDateBalanceRepository.existsBy.mockResolvedValue(true);

    await service.deletePurchase({ id: 1 }, input);

    expect(purchaseDateBalanceRepository.existsBy).toHaveBeenCalledWith({
      userId: 1,
      securityId: '005930',
    });
    expect(userBalanceRepository.delete).not.toHaveBeenCalled();
  });

  it('마지막 매수분을 지우면 UserBalance도 삭제한다', async () => {
    purchaseDateBalanceRepository.existsBy.mockResolvedValue(false);

    await service.deletePurchase({ id: 1 }, input);

    expect(userBalanceRepository.delete).toHaveBeenCalledWith({
      userId: 1,
      securityId: '005930',
    });
  });

  it('삭제된 행이 없으면 404, UserBalance는 건드리지 않는다', async () => {
    purchaseDateBalanceRepository.delete.mockResolvedValue({ affected: 0 });

    await expect(service.deletePurchase({ id: 1 }, input)).rejects.toThrow(
      NotFoundException,
    );
    expect(purchaseDateBalanceRepository.existsBy).not.toHaveBeenCalled();
    expect(userBalanceRepository.delete).not.toHaveBeenCalled();
  });

  it('사용자가 없으면 401, 아무것도 삭제하지 않는다', async () => {
    userRepository.findOne.mockResolvedValue(null);

    await expect(service.deletePurchase({ id: 1 }, input)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(purchaseDateBalanceRepository.delete).not.toHaveBeenCalled();
  });
});
