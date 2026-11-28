import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Between, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import {
  AccountType,
  Currency,
  DailyExchangeRate,
  Dividend,
  DividendType,
  PurchaseDateBalance,
  Security,
} from '@app/common';
import { SecurityRefresher } from '../../src/security/security.refresher.js';
import { DividendHistoryCalculator } from '../../src/balance/dividend-history.calculator.js';
import { PurchaseReader } from '../../src/balance/purchase.reader.js';
import { ExchangeRateReader } from '../../src/security/exchange-rate.reader.js';
import { ACCOUNT, accountProviders } from './account-providers.js';

// 1: 일반(과세), 2: ISA(비과세)
const ACCOUNTS = [ACCOUNT, { ...ACCOUNT, id: 2, accountType: AccountType.ISA }];

const KRW_SECURITY = { id: 'KR7005930003', name: '삼성전자', currency: Currency.KRW };
const USD_SECURITY = { id: 'US0378331005', name: 'Apple', currency: Currency.USD };

const purchase = (
  securityId: string,
  purchaseDate: string,
  amount: string,
  saleDate: string | null = null,
  accountId = 1,
) => ({ securityId, purchaseDate, amount, saleDate, accountId, price: '1.000000', sequence: 1 });

describe('DividendHistoryCalculator.calculate', () => {
  const purchaseDateBalanceRepository = { find: vi.fn() };
  const securityRepository = { findBy: vi.fn() };
  const dividendRepository = { find: vi.fn() };
  const dailyExchangeRateRepository = { findOne: vi.fn() };
  const securityRefresher = { refresh: vi.fn() };
  let service: DividendHistoryCalculator;

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        DividendHistoryCalculator,
        PurchaseReader,
        ExchangeRateReader,
        {
          provide: getRepositoryToken(PurchaseDateBalance),
          useValue: purchaseDateBalanceRepository,
        },
        { provide: getRepositoryToken(Security), useValue: securityRepository },
        { provide: getRepositoryToken(Dividend), useValue: dividendRepository },
        {
          provide: getRepositoryToken(DailyExchangeRate),
          useValue: dailyExchangeRateRepository,
        },
        { provide: SecurityRefresher, useValue: securityRefresher },
        ...accountProviders(ACCOUNTS),
      ],
    }).compile();
    service = moduleRef.get(DividendHistoryCalculator);
    securityRepository.findBy.mockResolvedValue([KRW_SECURITY, USD_SECURITY]);
  });

  it('보유했던 종목이 없으면 빈 내역을 돌려준다', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([]);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-04-20T12:00:00+09:00'));
    const result = await service.calculate({ id: 1, rules: [] }, {});
    vi.useRealTimers();

    // to를 생략하면 응답 to는 오늘 (조회 범위는 그대로 끝까지)
    expect(result).toEqual({
      from: null,
      to: '2026-04-20',
      total: {
        krwAmount: '0',
        usdAmount: '0.000000',
        usdKrwAmount: '0',
        totalKrwAmount: '0',
        afterTaxKrwAmount: '0',
        afterTaxUsdAmount: '0.000000',
        afterTaxUsdKrwAmount: '0',
        afterTaxTotalKrwAmount: '0',
      },
      months: [],
      scheduled: { total: expect.objectContaining({ totalKrwAmount: '0' }), items: [] },
    });
    expect(dividendRepository.find).not.toHaveBeenCalled();
    expect(securityRefresher.refresh).not.toHaveBeenCalled();
  });

  it('accountId를 주면 그 계좌 매수분만으로 보유 수량을 계산하고, 없으면 전체', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([]);

    await service.calculate({ id: 1, rules: [] }, { accountId: 2 });
    await service.calculate({ id: 1, rules: [] }, {});

    expect(purchaseDateBalanceRepository.find.mock.calls).toEqual([
      [{ where: { userId: 1, accountId: 2 } }],
      [{ where: { userId: 1 } }],
    ]);
  });

  it('배당락일이 없는 예전 행은 기준일 보유 수량 × 주당 배당금으로 계산하고 USD는 지급일 이전 최근 환율로 환산해 월별로 묶는다', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([
      // 기준일 당일 매수 → 포함
      purchase(KRW_SECURITY.id, '2026-03-31', '10.000000'),
      // 기준일 이전 매수, 기준일 당일 매도 → 제외
      purchase(KRW_SECURITY.id, '2026-01-02', '5.000000', '2026-03-31'),
      // 기준일 이후 매도 → 포함
      purchase(KRW_SECURITY.id, '2026-01-02', '3.000000', '2026-04-01'),
      purchase(USD_SECURITY.id, '2026-01-02', '2.500000'),
    ]);
    dividendRepository.find.mockResolvedValue([
      { id: KRW_SECURITY.id, noticeDate: '2026-03-31', paymentDate: '2026-04-20', amount: '361.000000', type: DividendType.MONEY },
      { id: USD_SECURITY.id, noticeDate: '2026-05-11', paymentDate: '2026-05-16', amount: '0.260000', type: DividendType.MONEY },
      // 기준일에 보유하지 않음 → 제외
      { id: KRW_SECURITY.id, noticeDate: '2025-12-31', paymentDate: '2026-04-21', amount: '100.000000', type: DividendType.MONEY },
    ]);
    // 2026-05-16(토) → 직전 금요일 환율
    dailyExchangeRateRepository.findOne.mockResolvedValue({
      date: '2026-05-15',
      currency: Currency.USD,
      closingRate: '1400.500000',
    });

    const result = await service.calculate(
      { id: 1, rules: [] },
      { from: '2026-04-01', to: '2026-06-30' },
    );

    // 배당을 읽기 전에 보유했던 종목마다 온라인 갱신
    expect(securityRefresher.refresh.mock.calls).toEqual([
      [KRW_SECURITY],
      [USD_SECURITY],
    ]);
    expect(securityRefresher.refresh.mock.invocationCallOrder[1]).toBeLessThan(
      dividendRepository.find.mock.invocationCallOrder[0],
    );
    expect(dividendRepository.find).toHaveBeenCalledWith({
      where: {
        id: In([KRW_SECURITY.id, USD_SECURITY.id]),
        type: DividendType.MONEY,
        paymentDate: Between('2026-04-01', '2026-06-30'),
      },
      order: { paymentDate: 'ASC', id: 'ASC' },
    });
    expect(dailyExchangeRateRepository.findOne).toHaveBeenCalledWith({
      where: { currency: Currency.USD, date: LessThanOrEqual('2026-05-16') },
      order: { date: 'DESC' },
    });
    expect(result.from).toBe('2026-04-01');
    expect(result.to).toBe('2026-06-30');
    expect(result.months).toEqual([
      {
        month: '2026-04',
        // 세금 4693 × 15.4% = 722.722 → 722
        summary: { krwAmount: '4693', usdAmount: '0.000000', usdKrwAmount: '0', totalKrwAmount: '4693', afterTaxKrwAmount: '3971', afterTaxUsdAmount: '0.000000', afterTaxUsdKrwAmount: '0', afterTaxTotalKrwAmount: '3971' },
        items: [
          {
            securityId: KRW_SECURITY.id,
            name: '삼성전자',
            currency: Currency.KRW,
            noticeDate: '2026-03-31',
            exDividendDate: null,
            paymentDate: '2026-04-20',
            perShareAmount: '361',
            quantity: '13',
            amount: '4693',
            taxAmount: '722',
            afterTaxAmount: '3971',
            afterTaxUsdAmount: null,
            afterTaxKrwAmount: '3971',
            usdAmount: null,
            krwAmount: '4693',
            exchangeRate: null,
            exchangeRateDate: null,
          },
        ],
      },
      {
        month: '2026-05',
        // 0.65 × 1400.5 = 910.325 → 910
        // 세금 0.65 × 15% = 0.0975, 세후 0.5525 × 1400.5 = 773.77 → 773
        summary: { krwAmount: '0', usdAmount: '0.650000', usdKrwAmount: '910', totalKrwAmount: '910', afterTaxKrwAmount: '0', afterTaxUsdAmount: '0.552500', afterTaxUsdKrwAmount: '773', afterTaxTotalKrwAmount: '773' },
        items: [
          {
            securityId: USD_SECURITY.id,
            name: 'Apple',
            currency: Currency.USD,
            noticeDate: '2026-05-11',
            exDividendDate: null,
            paymentDate: '2026-05-16',
            perShareAmount: '0.260000',
            quantity: '2.500000',
            amount: '0.650000',
            taxAmount: '0.097500',
            afterTaxAmount: '0.552500',
            afterTaxUsdAmount: '0.552500',
            afterTaxKrwAmount: '773',
            usdAmount: '0.650000',
            krwAmount: '910',
            exchangeRate: '1400.5',
            exchangeRateDate: '2026-05-15',
          },
        ],
      },
    ]);
    expect(result.total).toEqual({
      krwAmount: '4693',
      usdAmount: '0.650000',
      usdKrwAmount: '910',
      totalKrwAmount: '5603',
      afterTaxKrwAmount: '3971',
      afterTaxUsdAmount: '0.552500',
      afterTaxUsdKrwAmount: '773',
      afterTaxTotalKrwAmount: '4744',
    });
  });

  it('배당락일이 있으면 락일 전날까지 매수하고 락일 이후(당일 포함) 매도한 수량으로 계산한다', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([
      // 락일 전날 매수 → 포함
      purchase(KRW_SECURITY.id, '2025-12-26', '10.000000'),
      // 락일 당일 매수 → 제외 (기준일 이전이지만 받지 못함)
      purchase(KRW_SECURITY.id, '2025-12-29', '7.000000'),
      // 락일 당일 매도 → 포함 (기준일 전에 팔았지만 받음)
      purchase(KRW_SECURITY.id, '2025-01-02', '3.000000', '2025-12-29'),
      // 락일 전날 매도 → 제외
      purchase(KRW_SECURITY.id, '2025-01-02', '5.000000', '2025-12-26'),
    ]);
    dividendRepository.find.mockResolvedValue([
      {
        id: KRW_SECURITY.id,
        noticeDate: '2025-12-31',
        exDividendDate: '2025-12-29',
        paymentDate: '2026-04-20',
        amount: '100.000000',
        type: DividendType.MONEY,
      },
    ]);

    const result = await service.calculate({ id: 1, rules: [] }, {});

    expect(result.months[0].items[0]).toMatchObject({
      noticeDate: '2025-12-31',
      exDividendDate: '2025-12-29',
      quantity: '13',
      amount: '1300',
    });
  });

  it('환율이 없으면 원화 환산은 null이고 합계에서 빠진다. 기간이 한쪽만 있으면 그쪽만 제한한다', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([
      purchase(USD_SECURITY.id, '2026-01-02', '1.000000'),
    ]);
    dividendRepository.find.mockResolvedValue([
      { id: USD_SECURITY.id, noticeDate: '2026-02-09', paymentDate: '2026-02-12', amount: '0.250000', type: DividendType.MONEY },
    ]);
    dailyExchangeRateRepository.findOne.mockResolvedValue(null);

    const result = await service.calculate({ id: 1, rules: [] }, { from: '2026-01-01' });

    expect(dividendRepository.find.mock.calls[0][0].where.paymentDate).toEqual(
      MoreThanOrEqual('2026-01-01'),
    );
    expect(result.months[0].items[0]).toMatchObject({
      usdAmount: '0.250000',
      krwAmount: null,
      afterTaxUsdAmount: '0.212500',
      afterTaxKrwAmount: null,
      exchangeRate: null,
      exchangeRateDate: null,
    });
    expect(result.total).toEqual({
      krwAmount: '0',
      usdAmount: '0.250000',
      usdKrwAmount: '0',
      totalKrwAmount: '0',
      afterTaxKrwAmount: '0',
      afterTaxUsdAmount: '0.212500',
      afterTaxUsdKrwAmount: '0',
      afterTaxTotalKrwAmount: '0',
    });
  });

  it('기간이 없으면 지급일 조건 없이 전체를 조회한다', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([
      purchase(KRW_SECURITY.id, '2026-01-02', '1.000000'),
    ]);
    dividendRepository.find.mockResolvedValue([]);

    await service.calculate({ id: 1, rules: [] }, {});

    expect(dividendRepository.find.mock.calls[0][0].where).not.toHaveProperty('paymentDate');
  });

  it('세금은 일반 계좌 매수분에만 매기고, ISA 등 비과세 계좌 매수분은 세후 = 세전', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([
      purchase(KRW_SECURITY.id, '2026-01-02', '10.000000', null, 1),
      purchase(KRW_SECURITY.id, '2026-01-05', '30.000000', null, 2),
    ]);
    dividendRepository.find.mockResolvedValue([
      { id: KRW_SECURITY.id, noticeDate: '2026-03-31', paymentDate: '2026-04-20', amount: '361.000000', type: DividendType.MONEY },
    ]);

    const result = await service.calculate({ id: 1, rules: [] }, {});

    // 세전 361 × 40 = 14440, 세금은 일반 10주분 3610 × 15.4% = 555.94 → 555
    expect(result.months[0].items[0]).toMatchObject({
      quantity: '40',
      amount: '14440',
      taxAmount: '555',
      afterTaxAmount: '13885',
      afterTaxKrwAmount: '13885',
    });
    expect(result.total).toMatchObject({
      totalKrwAmount: '14440',
      afterTaxTotalKrwAmount: '13885',
    });
  });

  it('비과세 계좌만 보유하면 세금 0', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([
      purchase(KRW_SECURITY.id, '2026-01-02', '10.000000', null, 2),
    ]);
    dividendRepository.find.mockResolvedValue([
      { id: KRW_SECURITY.id, noticeDate: '2026-03-31', paymentDate: '2026-04-20', amount: '361.000000', type: DividendType.MONEY },
    ]);

    const result = await service.calculate({ id: 1, rules: [] }, {});

    expect(result.months[0].items[0]).toMatchObject({
      amount: '3610',
      taxAmount: '0',
      afterTaxAmount: '3610',
    });
  });

  it('지급일이 오늘 이후인 배당은 months·total에서 빼고 scheduled로 따로 돌려준다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-04-20T12:00:00+09:00'));
    try {
      purchaseDateBalanceRepository.find.mockResolvedValue([
        purchase(KRW_SECURITY.id, '2026-01-02', '10.000000'),
      ]);
      dividendRepository.find.mockResolvedValue([
        // 오늘 지급 → 지급분
        { id: KRW_SECURITY.id, noticeDate: '2026-03-31', paymentDate: '2026-04-20', amount: '100.000000', type: DividendType.MONEY },
        // 내일 지급 → 예정
        { id: KRW_SECURITY.id, noticeDate: '2026-03-31', paymentDate: '2026-04-21', amount: '50.000000', type: DividendType.MONEY },
      ]);

      const result = await service.calculate({ id: 1, rules: [] }, {});

      expect(result.months.flatMap((m) => m.items).map((i) => i.paymentDate)).toEqual(['2026-04-20']);
      expect(result.total).toMatchObject({ totalKrwAmount: '1000', afterTaxTotalKrwAmount: '846' });
      expect(result.scheduled.items.map((i) => [i.paymentDate, i.amount])).toEqual([['2026-04-21', '500']]);
      expect(result.scheduled.total).toMatchObject({ totalKrwAmount: '500', afterTaxTotalKrwAmount: '423' });
    } finally {
      vi.useRealTimers();
    }
  });
});
