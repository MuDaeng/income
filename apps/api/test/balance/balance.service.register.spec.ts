import { Test } from '@nestjs/testing';
import { LessThanOrEqual } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Currency,
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

const SAMSUNG = {
  id: 'KR7005930003',
  symbol: '005930',
  currency: Currency.KRW,
};
const INPUT = {
  securityId: SAMSUNG.id,
  securityCompany: SecurityCompany.KIWOOM,
  purchaseDate: '2026-11-05',
  amount: '10',
  price: '72000',
};

describe('BalanceService.registerBalance 배당 갱신', () => {
  const purchaseDateBalanceRepository = {
    findOne: vi.fn(),
    save: vi.fn(),
    create: vi.fn(),
  };
  const userBalanceRepository = { findOneBy: vi.fn(), save: vi.fn(), create: vi.fn() };
  const userRepository = { findOne: vi.fn() };
  const securityRepository = { findOneBy: vi.fn() };
  const dailySecurityRepository = { findOneBy: vi.fn() };
  const dailyExchangeRateRepository = { findOne: vi.fn() };
  const securityRefreshService = { refresh: vi.fn() };
  let service: BalanceService;

  beforeEach(async () => {
    vi.resetAllMocks();
    userRepository.findOne.mockResolvedValue({ id: 1 });
    securityRepository.findOneBy.mockResolvedValue(SAMSUNG);
    dailySecurityRepository.findOneBy.mockResolvedValue({
      lowestPrice: '71500.000000',
      highestPrice: '72300.000000',
    });
    userBalanceRepository.findOneBy.mockResolvedValue({ userId: 1 });
    purchaseDateBalanceRepository.findOne.mockResolvedValue(null);
    purchaseDateBalanceRepository.create.mockImplementation((row: object) => row);
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
        { provide: getRepositoryToken(UserBalance), useValue: userBalanceRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Security), useValue: securityRepository },
        { provide: getRepositoryToken(DailySecurity), useValue: dailySecurityRepository },
        { provide: getRepositoryToken(DailyExchangeRate), useValue: dailyExchangeRateRepository },
        { provide: SecurityRefreshService, useValue: securityRefreshService },
      ],
    }).compile();
    service = moduleRef.get(BalanceService);
  });

  it('잔고를 등록하고 그 종목의 배당·시세를 갱신한다', async () => {
    const saved = await service.registerBalance({ id: 1 }, INPUT);

    expect(securityRefreshService.refresh).toHaveBeenCalledWith(SAMSUNG);
    expect(saved).toMatchObject({
      securityId: SAMSUNG.id,
      securityCompany: SecurityCompany.KIWOOM,
      sequence: 1,
      amount: '10',
    });
  });

  it('매수일 시세가 없어 등록이 실패하면 배당을 조회하지 않는다', async () => {
    dailySecurityRepository.findOneBy.mockResolvedValue(null);

    await expect(service.registerBalance({ id: 1 }, INPUT)).rejects.toThrow(
      '해당 매수일의 시세가 없습니다.',
    );
    expect(securityRefreshService.refresh).not.toHaveBeenCalled();
  });

  it('등록을 저장한 뒤에 배당을 갱신한다', async () => {
    await service.registerBalance({ id: 1 }, INPUT);

    expect(purchaseDateBalanceRepository.save.mock.invocationCallOrder[0]).toBeLessThan(
      securityRefreshService.refresh.mock.invocationCallOrder[0],
    );
  });

  it('없는 종목이면 배당을 조회하지 않는다', async () => {
    securityRepository.findOneBy.mockResolvedValue(null);

    await expect(service.registerBalance({ id: 1 }, INPUT)).rejects.toThrow(
      '존재하지 않는 종목입니다.',
    );
    expect(securityRefreshService.refresh).not.toHaveBeenCalled();
  });

  describe('구매 환율', () => {
    const AAPL = { id: 'US0378331005', symbol: 'AAPL', currency: Currency.USD };
    const USD_INPUT = { ...INPUT, securityId: AAPL.id, amount: '1', price: '230' };

    beforeEach(() => {
      securityRepository.findOneBy.mockResolvedValue(AAPL);
      dailySecurityRepository.findOneBy.mockResolvedValue({
        lowestPrice: '229.000000',
        highestPrice: '231.000000',
      });
    });

    it('USD 종목은 입력한 환율을 소수 6자리로 버려서 저장한다', async () => {
      const saved = await service.registerBalance(
        { id: 1 },
        { ...USD_INPUT, exchangeRate: '1401.12345678' },
      );

      expect(saved).toMatchObject({ exchangeRate: '1401.123456' });
      expect(dailyExchangeRateRepository.findOne).not.toHaveBeenCalled();
    });

    it('USD 종목에 환율 입력이 없으면 매수일(이전 최근) USD 종가 환율을 저장한다', async () => {
      dailyExchangeRateRepository.findOne.mockResolvedValue({
        date: '2026-11-04',
        closingRate: '1398.5',
      });

      const saved = await service.registerBalance({ id: 1 }, USD_INPUT);

      expect(dailyExchangeRateRepository.findOne).toHaveBeenCalledWith({
        where: { currency: Currency.USD, date: LessThanOrEqual('2026-11-05') },
        order: { date: 'DESC' },
      });
      expect(saved).toMatchObject({ exchangeRate: '1398.500000' });
    });

    it('입력도 매수일 환율도 없으면 null로 저장한다', async () => {
      dailyExchangeRateRepository.findOne.mockResolvedValue(null);

      const saved = await service.registerBalance({ id: 1 }, USD_INPUT);

      expect(saved).toMatchObject({ exchangeRate: null });
    });

    it('KRW 종목은 환율을 입력해도 null로 저장한다', async () => {
      securityRepository.findOneBy.mockResolvedValue(SAMSUNG);
      dailySecurityRepository.findOneBy.mockResolvedValue({
        lowestPrice: '71500.000000',
        highestPrice: '72300.000000',
      });

      const saved = await service.registerBalance(
        { id: 1 },
        { ...INPUT, exchangeRate: '1400' },
      );

      expect(saved).toMatchObject({ exchangeRate: null });
      expect(dailyExchangeRateRepository.findOne).not.toHaveBeenCalled();
    });
  });
});
