import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Between, In, LessThanOrEqual } from 'typeorm';
import {
  Currency,
  DailyExchangeRate,
  DailySecurity,
  Dividend,
  DividendType,
  PurchaseDateBalance,
  Security,
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
  const dividendRepository = { find: vi.fn(), existsBy: vi.fn() };
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
    // 기본: 직전 12개월 이전에도 배당 기록이 있는 종목 (성장률은 12개월 합끼리)
    dividendRepository.existsBy.mockResolvedValue(true);
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
          previousPaymentCount: 1,
          // 461 / 300 − 1 = 53.666…
          growthRate: '53.66',
          growthBasis: 'TOTAL',
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
          previousPaymentCount: 0,
          growthRate: null,
          growthBasis: 'TOTAL',
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

  it('accountId를 주면 그 계좌 매수분만, 보유 종목이 없으면 배당·환율을 읽지 않는다', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([
      purchase(KRW.id, '2025-01-02', '5.000000', '5000.000000', '2026-01-02'),
    ]);

    const result = await service.getDividendMetrics(
      { id: 1, rules: [] },
      { accountId: 2 },
    );

    expect(purchaseDateBalanceRepository.find).toHaveBeenCalledWith({
      where: { userId: 1, accountId: 2 },
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

  describe('배당 성장률', () => {
    // KR70013P0000 (2025-05 상장, 월배당) 실제 1주당 배당. 오늘(2026-11-20) 기준 직전 12개월 7회, 최근 12개월 12회
    const LISTED_AMOUNTS = ['21', '18', '17', '18', '18', '19', '19', '19', '22', '22', '21', '17', '19', '21', '18', '22', '23', '17', '17'];
    const listedDividends = LISTED_AMOUNTS.map((amount, i) => {
      const paymentDate = new Date(Date.UTC(2025, 4 + i, 15)).toISOString().slice(0, 10);
      return dividend(KRW.id, paymentDate, `${amount}.000000`);
    });

    beforeEach(() => {
      securityRepository.findBy.mockResolvedValue([KRW]);
      purchaseDateBalanceRepository.find.mockResolvedValue([
        purchase(KRW.id, '2025-06-02', '10.000000', '10000.000000'),
      ]);
    });

    it('첫 배당이 직전 12개월 안이고 직전 횟수가 적으면(상장 1년 남짓) 회당 평균끼리 비교한다', async () => {
      dividendRepository.find.mockResolvedValue(listedDividends);
      dividendRepository.existsBy.mockResolvedValue(false);

      const result = await service.getDividendMetrics({ id: 1, rules: [] }, {});

      expect(dividendRepository.existsBy).toHaveBeenCalledWith({
        id: KRW.id,
        type: DividendType.MONEY,
        paymentDate: LessThanOrEqual('2024-11-20'),
      });
      expect(result.items[0]).toMatchObject({
        trailingPerShare: '238',
        paymentCount: 12,
        previousPerShare: '130',
        previousPaymentCount: 7,
        // 회당 평균 238/12 = 19.83 vs 130/7 = 18.57 → 6.79% (합끼리면 83.07%)
        growthRate: '6.79',
        growthBasis: 'PER_PAYMENT',
      });
    });

    it('직전 12개월 이전에도 배당 기록이 있으면 횟수가 달라도 12개월 합끼리 비교한다', async () => {
      dividendRepository.find.mockResolvedValue(listedDividends);
      dividendRepository.existsBy.mockResolvedValue(true);

      const result = await service.getDividendMetrics({ id: 1, rules: [] }, {});

      expect(result.items[0]).toMatchObject({ growthRate: '83.07', growthBasis: 'TOTAL' });
    });

    it('USD 종목은 횟수가 달라도 기록 시작을 확인하지 않고 12개월 합끼리 비교한다 (분기→월배당 전환 등)', async () => {
      securityRepository.findBy.mockResolvedValue([USD]);
      purchaseDateBalanceRepository.find.mockResolvedValue([
        purchase(USD.id, '2025-06-02', '10.000000', '100.000000'),
      ]);
      dividendRepository.find.mockResolvedValue(
        listedDividends.map((d) => ({ ...d, id: USD.id })),
      );
      dividendRepository.existsBy.mockResolvedValue(false);

      const result = await service.getDividendMetrics({ id: 1, rules: [] }, {});

      expect(dividendRepository.existsBy).not.toHaveBeenCalled();
      expect(result.items[0]).toMatchObject({
        previousPaymentCount: 7,
        paymentCount: 12,
        growthRate: '83.07',
        growthBasis: 'TOTAL',
      });
    });

    it('지급 횟수가 같으면 기록 시작을 확인하지 않고 12개월 합끼리 비교한다', async () => {
      dividendRepository.find.mockResolvedValue([
        dividend(KRW.id, '2025-04-15', '100.000000'),
        dividend(KRW.id, '2026-04-15', '110.000000'),
      ]);

      const result = await service.getDividendMetrics({ id: 1, rules: [] }, {});

      expect(dividendRepository.existsBy).not.toHaveBeenCalled();
      expect(result.items[0]).toMatchObject({
        previousPaymentCount: 1,
        growthRate: '10.00',
        growthBasis: 'TOTAL',
      });
    });
  });
});
