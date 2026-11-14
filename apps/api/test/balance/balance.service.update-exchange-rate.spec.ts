import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Currency,
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

const KEY = { securityId: 'US0378331005', purchaseDate: '2026-11-05', sequence: 2 };
const ROW = {
  userId: 1,
  ...KEY,
  amount: '1.000000',
  price: '230.000000',
  saleDate: null,
  exchangeRate: null,
};

describe('BalanceService.updateExchangeRate', () => {
  const purchaseDateBalanceRepository = { findOneBy: vi.fn(), save: vi.fn() };
  const userRepository = { findOne: vi.fn() };
  const securityRepository = { findOneBy: vi.fn() };
  let service: BalanceService;

  beforeEach(async () => {
    vi.resetAllMocks();
    userRepository.findOne.mockResolvedValue({ id: 1 });
    purchaseDateBalanceRepository.findOneBy.mockResolvedValue({ ...ROW });
    purchaseDateBalanceRepository.save.mockImplementation((row: object) =>
      Promise.resolve(row),
    );
    securityRepository.findOneBy.mockResolvedValue({
      id: KEY.securityId,
      currency: Currency.USD,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        BalanceService,
        {
          provide: getRepositoryToken(PurchaseDateBalance),
          useValue: purchaseDateBalanceRepository,
        },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Security), useValue: securityRepository },
        { provide: SecurityRefreshService, useValue: {} },
        { provide: getRepositoryToken(UserBalance), useValue: {} },
        { provide: getRepositoryToken(DailySecurity), useValue: {} },
        { provide: getRepositoryToken(DailyExchangeRate), useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(BalanceService);
  });

  it('User 행을 잠근 뒤 로그인 사용자의 매수분 환율을 소수 6자리로 버려서 저장한다', async () => {
    const result = await service.updateExchangeRate(
      { id: 1 },
      { ...KEY, exchangeRate: '1401.12345678' },
    );

    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: { id: 1 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(purchaseDateBalanceRepository.findOneBy).toHaveBeenCalledWith({
      userId: 1,
      ...KEY,
    });
    expect(result).toEqual({ ...ROW, exchangeRate: '1401.123456' });
    expect(purchaseDateBalanceRepository.save).toHaveBeenCalledTimes(1);
  });

  it('null이면 저장된 환율을 지운다', async () => {
    purchaseDateBalanceRepository.findOneBy.mockResolvedValue({
      ...ROW,
      exchangeRate: '1400.000000',
    });

    const result = await service.updateExchangeRate(
      { id: 1 },
      { ...KEY, exchangeRate: null },
    );

    expect(result.exchangeRate).toBeNull();
  });

  it('매수분이 없으면 404, 저장하지 않음', async () => {
    purchaseDateBalanceRepository.findOneBy.mockResolvedValue(null);

    await expect(
      service.updateExchangeRate({ id: 1 }, { ...KEY, exchangeRate: '1400' }),
    ).rejects.toThrow(NotFoundException);
    expect(purchaseDateBalanceRepository.save).not.toHaveBeenCalled();
  });

  it('KRW 종목이면 400, 저장하지 않음', async () => {
    securityRepository.findOneBy.mockResolvedValue({
      id: KEY.securityId,
      currency: Currency.KRW,
    });

    await expect(
      service.updateExchangeRate({ id: 1 }, { ...KEY, exchangeRate: '1400' }),
    ).rejects.toThrow(BadRequestException);
    expect(purchaseDateBalanceRepository.save).not.toHaveBeenCalled();
  });
});
