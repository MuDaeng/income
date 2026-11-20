import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Between, In } from 'typeorm';
import {
  Currency,
  DailyExchangeRate,
  DailySecurity,
  Dividend,
  DividendType,
  PurchaseDateBalance,
  Security,
  SecurityCompany,
} from '@app/common';
import { PurchaseRateReader } from '../../../src/balance/purchase-rate.reader.js';
import { PurchaseReader } from '../../../src/balance/purchase.reader.js';
import { DividendMetricsService } from '../../../src/balance/restapi/dividend-metrics.service.js';
import { DailyPriceReader } from '../../../src/security/daily-price.reader.js';
import { ExchangeRateReader } from '../../../src/security/exchange-rate.reader.js';
import { SecurityRefresher } from '../../../src/security/security.refresher.js';

const KRW = { id: 'KR7476800008', symbol: '476800', name: '리츠', currency: Currency.KRW };
const USD = { id: 'US0378331005', symbol: 'AAPL', name: '애플', currency: Currency.USD };

const purchase = (
  securityId: string,
  purchaseDate: string,
  amount: string,
  price: string,
  saleDate: string | null = null,
  exchangeRate: string | null = null,
) => ({ securityId, purchaseDate, amount, price, saleDate, exchangeRate });

const dividend = (id: string, paymentDate: string, amount: string) => ({
  id,
  paymentDate,
  noticeDate: paymentDate,
  exDividendDate: paymentDate,
  amount,
  type: DividendType.MONEY,
});

const PRICES: Record<string, string> = {
  [KRW.id]: '4000.000000',
  [USD.id]: '110.000000',
};

describe('DividendMetricsService.getDividendMetrics', () => {
  const purchaseDateBalanceRepository = { find: vi.fn() };
  const securityRepository = { findBy: vi.fn() };
  const dividendRepository = { find: vi.fn() };
  const dailySecurityRepository = { findOne: vi.fn() };
  const dailyExchangeRateRepository = { findOne: vi.fn() };
  const securityRefresher = { refresh: vi.fn() };
  let service: DividendMetricsService;

  beforeEach(async () => {
    vi.resetAllMocks();
    // 한국 시간 2026-11-20
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-20T03:00:00Z'));
    const moduleRef = await Test.createTestingModule({
      providers: [
        DividendMetricsService,
        PurchaseReader,
        PurchaseRateReader,
        DailyPriceReader,
        ExchangeRateReader,
        { provide: getRepositoryToken(PurchaseDateBalance), useValue: purchaseDateBalanceRepository },
        { provide: getRepositoryToken(Security), useValue: securityRepository },
        { provide: getRepositoryToken(Dividend), useValue: dividendRepository },
        { provide: getRepositoryToken(DailySecurity), useValue: dailySecurityRepository },
        { provide: getRepositoryToken(DailyExchangeRate), useValue: dailyExchangeRateRepository },
        { provide: SecurityRefresher, useValue: securityRefresher },
      ],
    }).compile();
    service = moduleRef.get(DividendMetricsService);

    securityRepository.findBy.mockResolvedValue([USD, KRW]);
    dailySecurityRepository.findOne.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          PRICES[where.id]
            ? { id: where.id, date: '2026-11-19', closingPrice: PRICES[where.id] }
            : null,
        ),
    );
    dailyExchangeRateRepository.findOne.mockResolvedValue({
      date: '2026-11-19',
      currency: Currency.USD,
      closingRate: '1400.000000',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('현재 보유분의 최근 12개월 배당으로 예상 연배당·YOC·현재 배당률·성장률과 합계를 계산한다', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([
      purchase(KRW.id, '2025-01-02', '100.000000', '5000.000000'),
      // 매도분 → 제외
      purchase(KRW.id, '2025-01-02', '50.000000', '5000.000000', '2026-01-02'),
      // 저장된 구매 환율 1300
      purchase(USD.id, '2025-01-02', '10.000000', '100.000000', null, '1300.000000'),
    ]);
    dividendRepository.find.mockResolvedValue([
      // 직전 12개월
      dividend(KRW.id, '2025-04-20', '300.000000'),
      // 최근 12개월
      dividend(KRW.id, '2025-12-01', '100.000000'),
      dividend(KRW.id, '2026-04-20', '361.000000'),
      dividend(USD.id, '2026-05-01', '0.250000'),
      dividend(USD.id, '2026-08-01', '0.250000'),
    ]);

    const result = await service.getDividendMetrics({ id: 1, rules: [] }, {});

    // 종목 코드순으로 온라인 갱신 후 최근 24개월 지급분을 읽는다
    expect(securityRefresher.refresh.mock.calls).toEqual([[KRW], [USD]]);
    expect(dividendRepository.find).toHaveBeenCalledWith({
      where: {
        id: In([KRW.id, USD.id]),
        type: DividendType.MONEY,
        paymentDate: Between('2024-11-21', '2026-11-20'),
      },
      order: { paymentDate: 'ASC', id: 'ASC' },
    });
    expect(result).toEqual({
      date: '2026-11-20',
      exchangeRate: '1400',
      exchangeRateDate: '2026-11-19',
      items: [
        {
          securityId: KRW.id,
          symbol: '476800',
          name: '리츠',
          currency: Currency.KRW,
          quantity: '100',
          trailingPerShare: '461',
          paymentCount: 2,
          previousPerShare: '300',
          // 461 / 300 − 1 = 53.666…
          growthRate: '53.66',
          annualDividend: '46100',
          krwAnnualDividend: '46100',
          krwPurchaseAmount: '500000',
          closingPrice: '4000',
          priceDate: '2026-11-19',
          krwEvaluationAmount: '400000',
          // 46100 / 500000
          yieldOnCost: '9.22',
          // 461 / 4000 = 11.525
          currentYield: '11.52',
        },
        {
          securityId: USD.id,
          symbol: 'AAPL',
          name: '애플',
          currency: Currency.USD,
          quantity: '10.000000',
          trailingPerShare: '0.500000',
          paymentCount: 2,
          previousPerShare: '0.000000',
          growthRate: null,
          annualDividend: '5.000000',
          // 5 × 1400
          krwAnnualDividend: '7000',
          // 10 × 100 × 1300
          krwPurchaseAmount: '1300000',
          closingPrice: '110.000000',
          priceDate: '2026-11-19',
          // 10 × 110 × 1400
          krwEvaluationAmount: '1540000',
          // 7000 / 1300000 = 0.538…
          yieldOnCost: '0.53',
          // 0.5 / 110 = 0.4545…
          currentYield: '0.45',
        },
      ],
      total: {
        krwAnnualDividend: '53100',
        krwPurchaseAmount: '1800000',
        krwEvaluationAmount: '1940000',
        // 53100 / 1800000 = 2.95
        yieldOnCost: '2.95',
        // 53100 / 1940000 = 2.737…
        currentYield: '2.73',
      },
    });
  });

  it('securityCompany를 주면 그 증권사 매수분만, 보유 종목이 없으면 배당·환율을 읽지 않는다', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([
      purchase(KRW.id, '2025-01-02', '5.000000', '5000.000000', '2026-01-02'),
    ]);

    const result = await service.getDividendMetrics(
      { id: 1, rules: [] },
      { securityCompany: SecurityCompany.TOSS },
    );

    expect(purchaseDateBalanceRepository.find).toHaveBeenCalledWith({
      where: { userId: 1, securityCompany: 'TOSS' },
    });
    expect(securityRepository.findBy).not.toHaveBeenCalled();
    expect(dividendRepository.find).not.toHaveBeenCalled();
    expect(dailyExchangeRateRepository.findOne).not.toHaveBeenCalled();
    expect(result).toEqual({
      date: '2026-11-20',
      exchangeRate: null,
      exchangeRateDate: null,
      items: [],
      total: {
        krwAnnualDividend: '0',
        krwPurchaseAmount: '0',
        krwEvaluationAmount: '0',
        yieldOnCost: null,
        currentYield: null,
      },
    });
  });

  it('시세가 없는 종목은 현재 배당률·평가금액이 null이고 합계 현재 배당률에서 빠진다', async () => {
    securityRepository.findBy.mockResolvedValue([KRW]);
    dailySecurityRepository.findOne.mockResolvedValue(null);
    purchaseDateBalanceRepository.find.mockResolvedValue([
      purchase(KRW.id, '2025-01-02', '10.000000', '1000.000000'),
    ]);
    dividendRepository.find.mockResolvedValue([dividend(KRW.id, '2026-04-20', '50.000000')]);

    const result = await service.getDividendMetrics({ id: 1, rules: [] }, {});

    expect(result.items[0]).toMatchObject({
      annualDividend: '500',
      closingPrice: null,
      priceDate: null,
      krwEvaluationAmount: null,
      yieldOnCost: '5.00',
      currentYield: null,
    });
    expect(result.total).toEqual({
      krwAnnualDividend: '500',
      krwPurchaseAmount: '10000',
      krwEvaluationAmount: '0',
      yieldOnCost: '5.00',
      currentYield: null,
    });
  });

  it('USD 보유 종목이 있는데 환율이 없으면 404', async () => {
    securityRepository.findBy.mockResolvedValue([USD]);
    purchaseDateBalanceRepository.find.mockResolvedValue([
      purchase(USD.id, '2025-01-02', '1.000000', '100.000000', null, '1300.000000'),
    ]);
    dividendRepository.find.mockResolvedValue([]);
    dailyExchangeRateRepository.findOne.mockResolvedValue(null);

    await expect(
      service.getDividendMetrics({ id: 1, rules: [] }, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
