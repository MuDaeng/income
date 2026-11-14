import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Currency,
  DailyExchangeRate,
  DailySecurity,
  PurchaseDateBalance,
  Security,
} from '@app/common';
import { DividendHistoryService } from '../../src/balance/dividend-history.service.js';
import { MonthlyBalanceService } from '../../src/balance/monthly-balance.service.js';

const KRW = { id: 'KR7476800008', name: '리츠', currency: Currency.KRW };
const SOLD = { id: 'KR7005930003', name: '삼성전자', currency: Currency.KRW };
const USD = { id: 'US0378331005', name: '애플', currency: Currency.USD };

const purchase = (
  securityId: string,
  purchaseDate: string,
  amount: string,
  price: string,
  saleDate: string | null = null,
  exchangeRate: string | null = null,
) => ({ securityId, purchaseDate, amount, price, saleDate, exchangeRate });

const PURCHASES = [
  purchase(KRW.id, '2025-12-01', '10.000000', '1000.000000'),
  // 월 중 매수 → 10월부터 반영
  purchase(KRW.id, '2026-10-15', '5.000000', '1200.000000'),
  // 10월 중 전량 매도 → 9월만 보유, 이후엔 배당만 남음
  purchase(SOLD.id, '2026-01-02', '2.000000', '50000.000000', '2026-10-20'),
  // 저장된 구매 환율 우선
  purchase(USD.id, '2026-09-10', '1.000000', '100.000000', null, '1300.000000'),
  // 구매 환율이 없으면 매수일(이전 최근) 환율 = 09-01의 1350
  purchase(USD.id, '2026-09-11', '1.000000', '100.000000'),
  // 마지막 기준일 이후 매수 → 제외
  purchase(KRW.id, '2026-11-20', '100.000000', '1000.000000'),
];

const price = (id: string, date: string, closingPrice: string) => ({
  id,
  date,
  closingPrice,
});
const PRICES = [
  price(KRW.id, '2026-09-30', '1100.000000'),
  price(SOLD.id, '2026-09-30', '60000.000000'),
  price(USD.id, '2026-09-30', '110.000000'),
  price(USD.id, '2026-10-30', '120.000000'),
  price(KRW.id, '2026-10-31', '1300.000000'),
  price(KRW.id, '2026-11-13', '1400.000000'),
  price(USD.id, '2026-11-13', '130.000000'),
];
const RATES = [
  { date: '2026-09-01', closingRate: '1350.000000' },
  { date: '2026-09-30', closingRate: '1380.000000' },
  { date: '2026-10-30', closingRate: '1400.000000' },
  { date: '2026-11-13', closingRate: '1420.000000' },
];

const dividend = (securityId: string, paymentDate: string, krwAmount: string | null) => ({
  securityId,
  paymentDate,
  krwAmount,
});

describe('MonthlyBalanceService.getMonthlyBalance', () => {
  const purchaseDateBalanceRepository = { find: vi.fn() };
  const securityRepository = { findBy: vi.fn() };
  const dailySecurityRepository = { find: vi.fn() };
  const dailyExchangeRateRepository = { find: vi.fn() };
  const dividendHistoryService = { getDividendHistory: vi.fn() };
  let service: MonthlyBalanceService;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.useFakeTimers({ now: new Date('2026-11-14T03:00:00Z'), toFake: ['Date'] });
    const moduleRef = await Test.createTestingModule({
      providers: [
        MonthlyBalanceService,
        { provide: getRepositoryToken(PurchaseDateBalance), useValue: purchaseDateBalanceRepository },
        { provide: getRepositoryToken(Security), useValue: securityRepository },
        { provide: getRepositoryToken(DailySecurity), useValue: dailySecurityRepository },
        { provide: getRepositoryToken(DailyExchangeRate), useValue: dailyExchangeRateRepository },
        { provide: DividendHistoryService, useValue: dividendHistoryService },
      ],
    }).compile();
    service = moduleRef.get(MonthlyBalanceService);

    purchaseDateBalanceRepository.find.mockResolvedValue(PURCHASES);
    securityRepository.findBy.mockResolvedValue([USD, KRW, SOLD]);
    dailySecurityRepository.find.mockResolvedValue(PRICES);
    dailyExchangeRateRepository.find.mockResolvedValue(RATES);
    dividendHistoryService.getDividendHistory.mockResolvedValue({
      months: [
        // from 이전 배당도 누적에 포함
        { items: [dividend(KRW.id, '2025-12-20', '500')] },
        { items: [dividend(KRW.id, '2026-10-10', '300')] },
        {
          items: [
            // 매도 후 지급된 배당 (기준일엔 보유했던 배당)
            dividend(SOLD.id, '2026-11-05', '1000'),
            // 원화 환산이 없는 배당은 제외
            dividend(USD.id, '2026-11-10', null),
          ],
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('월말(이번 달은 오늘) 기준 종목별·합계 원금, 평가금액, 평가금액+누적배당금', async () => {
    const result = await service.getMonthlyBalance(
      { id: 1 },
      { from: '2026-09', to: '2026-11' },
    );

    // 처음부터 마지막 기준일(오늘)까지의 배당을 한 번에 조회
    expect(dividendHistoryService.getDividendHistory).toHaveBeenCalledWith(
      { id: 1 },
      { to: '2026-11-14' },
    );
    expect(result.from).toBe('2026-09');
    expect(result.to).toBe('2026-11');
    expect(result.months.map((m) => [m.month, m.date])).toEqual([
      ['2026-09', '2026-09-30'],
      ['2026-10', '2026-10-31'],
      ['2026-11', '2026-11-14'],
    ]);

    const [sep, oct, nov] = result.months;

    // 9월: 삼성전자 보유 중, USD는 원금 130,000 + 135,000, 평가 2 × 110 × 1380
    expect(sep.items).toEqual([
      {
        securityId: SOLD.id, name: SOLD.name, currency: Currency.KRW, quantity: '2',
        purchaseAmount: '100000', evaluationAmount: '120000', dividendAmount: '0', totalAmount: '120000',
      },
      {
        securityId: KRW.id, name: KRW.name, currency: Currency.KRW, quantity: '10',
        purchaseAmount: '10000', evaluationAmount: '11000', dividendAmount: '500', totalAmount: '11500',
      },
      {
        securityId: USD.id, name: USD.name, currency: Currency.USD, quantity: '2.000000',
        purchaseAmount: '265000', evaluationAmount: '303600', dividendAmount: '0', totalAmount: '303600',
      },
    ]);
    expect(sep.total).toEqual({
      purchaseAmount: '375000',
      evaluationAmount: '434600',
      dividendAmount: '500',
      totalAmount: '435100',
    });

    // 10월: 삼성전자 매도(배당 아직 없음) → 빠짐, 리츠 추가 매수 반영
    expect(oct.items.map((i) => i.securityId)).toEqual([KRW.id, USD.id]);
    expect(oct.items[0]).toMatchObject({
      quantity: '15', purchaseAmount: '16000', evaluationAmount: '19500', dividendAmount: '800', totalAmount: '20300',
    });
    expect(oct.items[1]).toMatchObject({ purchaseAmount: '265000', evaluationAmount: '336000' });
    expect(oct.total).toEqual({
      purchaseAmount: '281000',
      evaluationAmount: '355500',
      dividendAmount: '800',
      totalAmount: '356300',
    });

    // 11월(오늘 기준): 삼성전자는 수량 0이지만 매도 후 받은 배당으로 다시 나타남
    expect(nov.items.find((i) => i.securityId === SOLD.id)).toEqual({
      securityId: SOLD.id, name: SOLD.name, currency: Currency.KRW, quantity: '0',
      purchaseAmount: '0', evaluationAmount: '0', dividendAmount: '1000', totalAmount: '1000',
    });
    expect(nov.total).toEqual({
      purchaseAmount: '281000',
      evaluationAmount: '390200',
      dividendAmount: '1800',
      totalAmount: '392000',
    });
  });

  it('보유 중인 종목의 기준일 이전 시세가 없으면 404', async () => {
    dailySecurityRepository.find.mockResolvedValue(
      PRICES.filter((p) => p.id !== KRW.id),
    );

    await expect(
      service.getMonthlyBalance({ id: 1 }, { from: '2026-09', to: '2026-09' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('보유분도 배당도 없으면 빈 월 목록 값', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([]);
    dividendHistoryService.getDividendHistory.mockResolvedValue({ months: [] });

    const result = await service.getMonthlyBalance(
      { id: 1 },
      { from: '2026-10', to: '2026-11' },
    );

    expect(securityRepository.findBy).not.toHaveBeenCalled();
    expect(result.months).toEqual([
      {
        month: '2026-10', date: '2026-10-31', items: [],
        total: { purchaseAmount: '0', evaluationAmount: '0', dividendAmount: '0', totalAmount: '0' },
      },
      {
        month: '2026-11', date: '2026-11-14', items: [],
        total: { purchaseAmount: '0', evaluationAmount: '0', dividendAmount: '0', totalAmount: '0' },
      },
    ]);
  });
});
