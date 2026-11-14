import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Currency,
  DailyExchangeRate,
  DailySecurity,
  PurchaseDateBalance,
  Security,
  SecurityCompany,
} from '@app/common';
import { DividendHistoryService } from '../../src/balance/dividend-history.service.js';
import { PeriodReturnService } from '../../src/balance/period-return.service.js';

const KRW = { id: 'KR7476800008', name: '리츠', currency: Currency.KRW };
const USD = { id: 'US0378331005', name: '애플', currency: Currency.USD };
const SOLD = { id: 'KR7005930003', name: '삼성전자', currency: Currency.KRW };

const purchase = (
  securityId: string,
  purchaseDate: string,
  amount: string,
  price: string,
  saleDate: string | null = null,
) => ({ securityId, purchaseDate, amount, price, saleDate });

const RATES: Record<string, string> = {
  '2026-01-02': '1400.000000',
  '2026-02-02': '1450.000000',
  '2026-11-06': '1350.000000',
};

describe('PeriodReturnService.getPeriodReturn', () => {
  const purchaseDateBalanceRepository = { find: vi.fn() };
  const securityRepository = { findBy: vi.fn() };
  const dailySecurityRepository = { findOne: vi.fn() };
  const dailyExchangeRateRepository = { findOne: vi.fn() };
  const dividendHistoryService = { getDividendHistory: vi.fn() };
  let service: PeriodReturnService;

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PeriodReturnService,
        { provide: getRepositoryToken(PurchaseDateBalance), useValue: purchaseDateBalanceRepository },
        { provide: getRepositoryToken(Security), useValue: securityRepository },
        { provide: getRepositoryToken(DailySecurity), useValue: dailySecurityRepository },
        { provide: getRepositoryToken(DailyExchangeRate), useValue: dailyExchangeRateRepository },
        { provide: DividendHistoryService, useValue: dividendHistoryService },
      ],
    }).compile();
    service = moduleRef.get(PeriodReturnService);

    securityRepository.findBy.mockResolvedValue([KRW, USD, SOLD]);
    dailySecurityRepository.findOne.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve({
          id: where.id,
          date: '2026-11-06',
          closingPrice: where.id === USD.id ? '110.000000' : '4000.000000',
        }),
    );
    // LessThanOrEqual(date)의 값으로 그날(이전 최근) 환율을 돌려준다
    dailyExchangeRateRepository.findOne.mockImplementation(
      ({ where }: { where: { date: { value: string } } }) => {
        const date = Object.keys(RATES)
          .filter((d) => d <= where.date.value)
          .sort()
          .at(-1);
        return Promise.resolve(
          date ? { date, currency: Currency.USD, closingRate: RATES[date] } : null,
        );
      },
    );
  });

  it('종료일 보유분 평가 + 기간 배당금으로 종목별·전체 원금 대비 수익을 계산한다', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([
      purchase(KRW.id, '2026-01-02', '1000.000000', '5000.000000'),
      purchase(KRW.id, '2026-02-02', '500.000000', '4800.000000'),
      // 종료일 이후 매수 → 제외
      purchase(KRW.id, '2026-12-01', '100.000000', '4000.000000'),
      // 매수일 환율이 다른 두 매수분
      purchase(USD.id, '2026-01-02', '10.000000', '100.000000'),
      purchase(USD.id, '2026-02-03', '5.000000', '104.000000'),
      // 종료일 이전 전량 매도 → 평가 0, 배당만
      purchase(SOLD.id, '2026-01-02', '10.000000', '50000.000000', '2026-06-01'),
    ]);
    dividendHistoryService.getDividendHistory.mockResolvedValue({
      months: [
        {
          items: [
            { securityId: KRW.id, usdAmount: null, krwAmount: '30000' },
            { securityId: USD.id, usdAmount: '2.500000', krwAmount: '3500' },
            { securityId: SOLD.id, usdAmount: null, krwAmount: '3610' },
          ],
        },
        {
          items: [
            { securityId: KRW.id, usdAmount: null, krwAmount: '45000' },
            // 환율 없는 배당은 원화 합계에서 빠진다
            { securityId: USD.id, usdAmount: '3.750000', krwAmount: null },
          ],
        },
      ],
    });

    const result = await service.getPeriodReturn(
      { id: 1 },
      { from: '2026-01-01', to: '2026-11-30' },
    );

    expect(dividendHistoryService.getDividendHistory).toHaveBeenCalledWith(
      { id: 1 },
      { from: '2026-01-01', to: '2026-11-30' },
    );
    expect(result.exchangeRate).toBe('1350');
    expect(result.exchangeRateDate).toBe('2026-11-06');

    const [samsung, reits, apple] = result.evaluation.items;
    // 1500주, 원금 5,000,000 + 2,400,000, 평가 4,000 × 1500
    expect(reits).toMatchObject({
      quantity: '1500',
      closingPrice: '4000',
      priceDate: '2026-11-06',
      usdPurchaseAmount: null,
      krwPurchaseAmount: '7400000',
      krwEvaluationAmount: '6000000',
      profit: '-1400000',
      returnRate: '-18.91',
    });
    // 원금: 1000 × 1400 + 520 × 1450(2026-02-02 환율) = 2,154,000 / 평가: 1650 × 1350 = 2,227,500
    expect(apple).toMatchObject({
      quantity: '15.000000',
      usdPurchaseAmount: '1520.000000',
      usdEvaluationAmount: '1650.000000',
      krwPurchaseAmount: '2154000',
      krwEvaluationAmount: '2227500',
      profit: '73500',
      returnRate: '3.41',
    });
    expect(samsung).toMatchObject({
      quantity: '0',
      closingPrice: null,
      krwPurchaseAmount: '0',
      krwEvaluationAmount: '0',
      returnRate: '0.00',
    });
    expect(result.evaluation.total).toEqual({
      purchaseAmount: '9554000',
      evaluationAmount: '8227500',
      profit: '-1326500',
      returnRate: '-13.88',
    });

    expect(result.dividend.items).toEqual([
      { securityId: SOLD.id, name: '삼성전자', currency: Currency.KRW, usdAmount: null, krwAmount: '3610' },
      { securityId: KRW.id, name: '리츠', currency: Currency.KRW, usdAmount: null, krwAmount: '75000' },
      { securityId: USD.id, name: '애플', currency: Currency.USD, usdAmount: '6.250000', krwAmount: '3500' },
    ]);
    expect(result.dividend.total).toEqual({ usdAmount: '6.250000', krwAmount: '82110' });

    expect(result.total.items[1]).toEqual({
      securityId: KRW.id,
      name: '리츠',
      purchaseAmount: '7400000',
      evaluationAmount: '6000000',
      dividendAmount: '75000',
      totalAmount: '6075000',
      profit: '-1325000',
      returnRate: '-17.90',
    });
    expect(result.total.total).toEqual({
      purchaseAmount: '9554000',
      evaluationAmount: '8227500',
      dividendAmount: '82110',
      totalAmount: '8309610',
      profit: '-1244390',
      returnRate: '-13.02',
    });
  });

  it('USD 매수분에 저장된 구매 환율이 있으면 매수일 환율 대신 그 환율로 원금을 환산한다', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([
      // 저장 환율 1300 (매수일 환율 1400은 안 씀), 매수일 이전 환율이 없어도 404가 아님
      { ...purchase(USD.id, '2025-12-31', '10.000000', '100.000000'), exchangeRate: '1300.000000' },
      // 저장 환율 없음 → 2026-02-02 환율 1450
      { ...purchase(USD.id, '2026-02-03', '5.000000', '104.000000'), exchangeRate: null },
    ]);
    dividendHistoryService.getDividendHistory.mockResolvedValue({ months: [] });

    const result = await service.getPeriodReturn(
      { id: 1 },
      { from: '2026-01-01', to: '2026-11-30' },
    );

    // 1000 × 1300 + 520 × 1450 = 2,054,000
    expect(
      result.evaluation.items.find((item) => item.securityId === USD.id),
    ).toMatchObject({ krwPurchaseAmount: '2054000' });
    // 매수일 환율은 저장 환율이 없는 매수분과 종료일 환율만 조회
    expect(dailyExchangeRateRepository.findOne).toHaveBeenCalledTimes(2);
  });

  it('USD 매수일 이전 환율이 없으면 404', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([
      purchase(USD.id, '2025-12-31', '1.000000', '100.000000'),
    ]);
    dividendHistoryService.getDividendHistory.mockResolvedValue({ months: [] });

    await expect(
      service.getPeriodReturn({ id: 1 }, { from: '2026-01-01', to: '2026-11-30' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('보유·배당 종목이 없으면 0으로 채운 빈 결과', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([]);
    dividendHistoryService.getDividendHistory.mockResolvedValue({ months: [] });

    const result = await service.getPeriodReturn(
      { id: 1 },
      { from: '2026-01-01', to: '2026-11-30' },
    );

    expect(securityRepository.findBy).not.toHaveBeenCalled();
    expect(result.evaluation.items).toEqual([]);
    expect(result.total.total).toEqual({
      purchaseAmount: '0',
      evaluationAmount: '0',
      dividendAmount: '0',
      totalAmount: '0',
      profit: '0',
      returnRate: '0.00',
    });
    expect(result.exchangeRate).toBeNull();
  });

  it('securityCompany를 주면 그 증권사 매수분과 그 보유분의 배당만으로 계산, 없으면 전체', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([]);
    dividendHistoryService.getDividendHistory.mockResolvedValue({ months: [] });
    const range = { from: '2026-01-01', to: '2026-11-30' };

    await service.getPeriodReturn({ id: 1 }, { ...range, securityCompany: SecurityCompany.KIWOOM });
    await service.getPeriodReturn({ id: 1 }, range);

    expect(purchaseDateBalanceRepository.find.mock.calls).toEqual([
      [{ where: { userId: 1, securityCompany: SecurityCompany.KIWOOM } }],
      [{ where: { userId: 1 } }],
    ]);
    expect(dividendHistoryService.getDividendHistory.mock.calls).toEqual([
      [{ id: 1 }, { ...range, securityCompany: SecurityCompany.KIWOOM }],
      [{ id: 1 }, range],
    ]);
  });
});
