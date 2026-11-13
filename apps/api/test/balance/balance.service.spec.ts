import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull } from 'typeorm';
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

const KRW_SECURITY = { id: '005930', name: '삼성전자', currency: Currency.KRW };
const USD_SECURITY = { id: 'AAPL', name: 'Apple', currency: Currency.USD };

describe('BalanceService.getIntegratedBalance', () => {
  const userBalanceRepository = { find: vi.fn() };
  const purchaseDateBalanceRepository = { find: vi.fn() };
  const dailySecurityRepository = { findOne: vi.fn() };
  const dailyExchangeRateRepository = { findOne: vi.fn() };
  let service: BalanceService;

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BalanceService,
        {
          provide: getRepositoryToken(UserBalance),
          useValue: userBalanceRepository,
        },
        {
          provide: getRepositoryToken(PurchaseDateBalance),
          useValue: purchaseDateBalanceRepository,
        },
        {
          provide: getRepositoryToken(DailySecurity),
          useValue: dailySecurityRepository,
        },
        {
          provide: getRepositoryToken(DailyExchangeRate),
          useValue: dailyExchangeRateRepository,
        },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(Security), useValue: {} },
        { provide: SecurityRefreshService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(BalanceService);
  });

  it('KRW·USD 종목의 매입평균가·평가금액·원화 환산·합계·수익률을 계산한다', async () => {
    userBalanceRepository.find.mockResolvedValue([
      { userId: 1, securityId: KRW_SECURITY.id, security: KRW_SECURITY },
      { userId: 1, securityId: USD_SECURITY.id, security: USD_SECURITY },
    ]);
    // DB는 DECIMAL을 소수 6자리 문자열로 돌려준다
    purchaseDateBalanceRepository.find.mockResolvedValue([
      { securityId: '005930', amount: '10.000000', price: '70000.000000' },
      { securityId: '005930', amount: '10.000000', price: '80000.000000' },
      { securityId: 'AAPL', amount: '2.000000', price: '100.500000' },
      { securityId: 'AAPL', amount: '1.000000', price: '97.000000' },
    ]);
    dailySecurityRepository.findOne.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve({
          id: where.id,
          closingPrice: where.id === 'AAPL' ? '110.000000' : '90000.000000',
        }),
    );
    dailyExchangeRateRepository.findOne.mockResolvedValue({
      date: '2026-11-06',
      currency: Currency.USD,
      closingRate: '1400.500000',
    });

    const result = await service.getIntegratedBalance({ id: 1 });

    expect(result.items).toEqual([
      {
        securityId: '005930',
        name: '삼성전자',
        currency: Currency.KRW,
        amount: '20',
        currentPrice: '90000',
        returnRate: '20.00',
        krwAveragePrice: '75000',
        usdAveragePrice: null,
        krwPurchaseAmount: '1500000',
        usdPurchaseAmount: null,
        krwEvaluationAmount: '1800000',
        usdEvaluationAmount: null,
      },
      {
        securityId: 'AAPL',
        name: 'Apple',
        currency: Currency.USD,
        amount: '3.000000',
        currentPrice: '110.000000',
        returnRate: '10.73', // 32 / 298
        krwAveragePrice: '139116', // 99.333… × 1400.5
        usdAveragePrice: '99.333333',
        krwPurchaseAmount: '417349', // 298 × 1400.5
        usdPurchaseAmount: '298.000000',
        krwEvaluationAmount: '462165', // 330 × 1400.5
        usdEvaluationAmount: '330.000000',
      },
    ]);
    expect(result.krwTotal).toEqual({
      purchaseAmount: '1500000',
      evaluationAmount: '1800000',
      returnRate: '20.00',
    });
    expect(result.usdTotal).toEqual({
      usdPurchaseAmount: '298.000000',
      usdEvaluationAmount: '330.000000',
      krwPurchaseAmount: '417349',
      krwEvaluationAmount: '462165',
      returnRate: '10.73',
    });
    expect(result.total).toEqual({
      purchaseAmount: '1917349',
      evaluationAmount: '2262165',
      returnRate: '17.98', // 344816 / 1917349
    });
    expect(result.exchangeRate).toBe('1400.5');
    expect(result.exchangeRateDate).toBe('2026-11-06');
    expect(purchaseDateBalanceRepository.find).toHaveBeenCalledWith({
      where: { userId: 1, saleDate: IsNull() },
    });
  });

  it('미매도 매수분이 없는(전량 매도한) 종목은 제외하고 시세·환율도 조회하지 않는다', async () => {
    userBalanceRepository.find.mockResolvedValue([
      { userId: 1, securityId: KRW_SECURITY.id, security: KRW_SECURITY },
      { userId: 1, securityId: USD_SECURITY.id, security: USD_SECURITY },
    ]);
    // saleDate IS NULL 조건으로 조회한 결과: AAPL은 전부 매도돼서 없음
    purchaseDateBalanceRepository.find.mockResolvedValue([
      { securityId: '005930', amount: '10.000000', price: '70000.000000' },
    ]);
    dailySecurityRepository.findOne.mockResolvedValue({
      id: '005930',
      closingPrice: '77000.000000',
    });

    const result = await service.getIntegratedBalance({ id: 1 });

    expect(result.items.map((item) => item.securityId)).toEqual(['005930']);
    expect(result.total).toEqual({
      purchaseAmount: '700000',
      evaluationAmount: '770000',
      returnRate: '10.00',
    });
    expect(result.exchangeRate).toBeNull();
    expect(dailySecurityRepository.findOne).toHaveBeenCalledTimes(1);
    expect(dailyExchangeRateRepository.findOne).not.toHaveBeenCalled();
  });

  it('보유 종목이 없으면 빈 목록과 0 합계를 돌려주고 환율은 조회하지 않는다', async () => {
    userBalanceRepository.find.mockResolvedValue([]);
    purchaseDateBalanceRepository.find.mockResolvedValue([]);

    const result = await service.getIntegratedBalance({ id: 1 });

    expect(result.items).toEqual([]);
    expect(result.total).toEqual({
      purchaseAmount: '0',
      evaluationAmount: '0',
      returnRate: '0.00',
    });
    expect(result.usdTotal.usdPurchaseAmount).toBe('0.000000');
    expect(result.exchangeRate).toBeNull();
    expect(dailyExchangeRateRepository.findOne).not.toHaveBeenCalled();
  });

  it('USD 종목이 있는데 환율이 없으면 404', async () => {
    userBalanceRepository.find.mockResolvedValue([
      { userId: 1, securityId: USD_SECURITY.id, security: USD_SECURITY },
    ]);
    purchaseDateBalanceRepository.find.mockResolvedValue([
      { securityId: 'AAPL', amount: '1.000000', price: '100.000000' },
    ]);
    dailyExchangeRateRepository.findOne.mockResolvedValue(null);

    await expect(service.getIntegratedBalance({ id: 1 })).rejects.toThrow(
      NotFoundException,
    );
  });
});
