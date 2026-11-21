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
  AccountType,
  SecurityCompany,
  User,
  UserBalance,
} from '@app/common';
import { SecurityRefresher } from '../../../src/security/security.refresher.js';
import { ACCOUNT, accountProviders } from '../account-providers.js';

// 1: 키움, 2: 토스, 3: 미래에셋 (모두 일반 계좌)
const ACCOUNTS = [
  ACCOUNT,
  { ...ACCOUNT, id: 2, securityCompany: SecurityCompany.TOSS },
  { ...ACCOUNT, id: 3, securityCompany: SecurityCompany.MIRAE_ASSET },
];
import { BalanceService } from '../../../src/balance/restapi/balance.service.js';
import { PurchaseRateReader } from '../../../src/balance/purchase-rate.reader.js';
import { PurchaseWriter } from '../../../src/balance/purchase.writer.js';
import { DailyPriceReader } from '../../../src/security/daily-price.reader.js';
import { ExchangeRateReader } from '../../../src/security/exchange-rate.reader.js';

const KRW_SECURITY = { id: '005930', symbol: '005930', name: '삼성전자', currency: Currency.KRW };
const USD_SECURITY = { id: 'AAPL', symbol: 'AAPL', name: 'Apple', currency: Currency.USD };

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
        DailyPriceReader,
        ExchangeRateReader,
        PurchaseRateReader,
        PurchaseWriter,
        ...accountProviders(ACCOUNTS),
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
        { provide: SecurityRefresher, useValue: {} },
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
      { securityId: '005930', accountId: 2, amount: '10.000000', price: '70000.000000' },
      { securityId: '005930', accountId: 3, amount: '10.000000', price: '80000.000000' },
      { securityId: 'AAPL', accountId: 1, amount: '2.000000', price: '100.500000' },
      { securityId: 'AAPL', accountId: 1, amount: '1.000000', price: '97.000000' },
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

    const result = await service.getIntegratedBalance({ id: 1, rules: [] });

    expect(result.items).toEqual([
      {
        securityId: '005930',
        symbol: '005930',
        name: '삼성전자',
        currency: Currency.KRW,
        amount: '20',
        // 계좌별 수량은 계좌 id 순
        accountAmounts: [
          { accountId: 2, securityCompany: SecurityCompany.TOSS, accountType: AccountType.NORMAL, amount: '10' },
          { accountId: 3, securityCompany: SecurityCompany.MIRAE_ASSET, accountType: AccountType.NORMAL, amount: '10' },
        ],
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
        symbol: 'AAPL',
        name: 'Apple',
        currency: Currency.USD,
        amount: '3.000000',
        accountAmounts: [
          { accountId: 1, securityCompany: SecurityCompany.KIWOOM, accountType: AccountType.NORMAL, amount: '3.000000' },
        ],
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

  it('USD 원화 매입금액은 매수분의 저장 환율, 없으면 매수일 환율로 환산하고 평가는 최신 환율로 한다', async () => {
    userBalanceRepository.find.mockResolvedValue([
      { userId: 1, securityId: USD_SECURITY.id, security: USD_SECURITY },
    ]);
    purchaseDateBalanceRepository.find.mockResolvedValue([
      // 저장 환율 1300 → 200 × 1300 = 260000
      { securityId: 'AAPL', purchaseDate: '2026-01-05', amount: '2.000000', price: '100.000000', exchangeRate: '1300.000000' },
      // 저장 환율 없음 → 매수일(이전 최근) 환율 1350 → 100 × 1350 = 135000
      { securityId: 'AAPL', purchaseDate: '2026-03-02', amount: '1.000000', price: '100.000000', exchangeRate: null },
    ]);
    dailySecurityRepository.findOne.mockResolvedValue({
      id: 'AAPL',
      closingPrice: '110.000000',
    });
    // 매수일 환율 조회(date 조건 있음)와 최신 환율 조회(date 조건 없음)를 구분
    dailyExchangeRateRepository.findOne.mockImplementation(
      ({ where }: { where: { date?: unknown } }) =>
        Promise.resolve(
          where.date
            ? { date: '2026-02-27', currency: Currency.USD, closingRate: '1350.000000' }
            : { date: '2026-11-06', currency: Currency.USD, closingRate: '1400.000000' },
        ),
    );

    const result = await service.getIntegratedBalance({ id: 1, rules: [] });

    expect(result.items[0]).toMatchObject({
      krwPurchaseAmount: '395000', // 260000 + 135000
      krwAveragePrice: '131666', // 395000 / 3
      usdPurchaseAmount: '300.000000',
      krwEvaluationAmount: '462000', // 330 × 1400
      returnRate: '10.00', // 외화 기준 30 / 300
    });
    expect(result.total).toEqual({
      purchaseAmount: '395000',
      evaluationAmount: '462000',
      returnRate: '16.96', // 67000 / 395000 (환차익 포함)
    });
    expect(result.exchangeRate).toBe('1400');
    // 매수일 환율은 저장 환율이 없는 매수분 하나만 조회
    expect(dailyExchangeRateRepository.findOne).toHaveBeenCalledTimes(2);
  });

  it('저장 환율도 매수일 환율도 없는 USD 매수분이 있으면 404', async () => {
    userBalanceRepository.find.mockResolvedValue([
      { userId: 1, securityId: USD_SECURITY.id, security: USD_SECURITY },
    ]);
    purchaseDateBalanceRepository.find.mockResolvedValue([
      { securityId: 'AAPL', purchaseDate: '2020-01-02', amount: '1.000000', price: '100.000000', exchangeRate: null },
    ]);
    dailyExchangeRateRepository.findOne.mockImplementation(
      ({ where }: { where: { date?: unknown } }) =>
        Promise.resolve(
          where.date
            ? null
            : { date: '2026-11-06', currency: Currency.USD, closingRate: '1400.000000' },
        ),
    );

    await expect(service.getIntegratedBalance({ id: 1, rules: [] })).rejects.toThrow(
      '2020-01-02 이전의 USD 환율 정보가 없습니다.',
    );
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

    const result = await service.getIntegratedBalance({ id: 1, rules: [] });

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

  it('accountId를 주면 그 계좌의 미매도 매수분만 조회한다', async () => {
    userBalanceRepository.find.mockResolvedValue([
      { userId: 1, securityId: KRW_SECURITY.id, security: KRW_SECURITY },
      { userId: 1, securityId: USD_SECURITY.id, security: USD_SECURITY },
    ]);
    // 1번 계좌 조건으로 조회한 결과: AAPL은 다른 계좌에만 있어서 없음
    purchaseDateBalanceRepository.find.mockResolvedValue([
      { securityId: '005930', amount: '10.000000', price: '70000.000000' },
    ]);
    dailySecurityRepository.findOne.mockResolvedValue({
      id: '005930',
      closingPrice: '77000.000000',
    });

    const result = await service.getIntegratedBalance(
      { id: 1, rules: [] },
      { accountId: 1 },
    );

    expect(purchaseDateBalanceRepository.find).toHaveBeenCalledWith({
      where: {
        userId: 1,
        saleDate: IsNull(),
        accountId: 1,
      },
    });
    expect(result.items.map((item) => item.securityId)).toEqual(['005930']);
    expect(dailyExchangeRateRepository.findOne).not.toHaveBeenCalled();
  });

  it('accountId가 없으면 전체 계좌로 조회한다', async () => {
    userBalanceRepository.find.mockResolvedValue([]);
    purchaseDateBalanceRepository.find.mockResolvedValue([]);

    await service.getIntegratedBalance({ id: 1, rules: [] }, {});

    expect(purchaseDateBalanceRepository.find).toHaveBeenCalledWith({
      where: { userId: 1, saleDate: IsNull() },
    });
  });

  it('보유 종목이 없으면 빈 목록과 0 합계를 돌려주고 환율은 조회하지 않는다', async () => {
    userBalanceRepository.find.mockResolvedValue([]);
    purchaseDateBalanceRepository.find.mockResolvedValue([]);

    const result = await service.getIntegratedBalance({ id: 1, rules: [] });

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

    await expect(service.getIntegratedBalance({ id: 1, rules: [] })).rejects.toThrow(
      NotFoundException,
    );
  });
});
