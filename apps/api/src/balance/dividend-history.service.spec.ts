import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Between, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import {
  Currency,
  DailyExchangeRate,
  Dividend,
  DividendType,
  PurchaseDateBalance,
  Security,
} from '@app/common';
import { SecurityRefreshService } from '../security/security-refresh.service.js';
import { DividendHistoryService } from './dividend-history.service.js';

const KRW_SECURITY = { id: 'KR7005930003', name: '삼성전자', currency: Currency.KRW };
const USD_SECURITY = { id: 'US0378331005', name: 'Apple', currency: Currency.USD };

const purchase = (
  securityId: string,
  purchaseDate: string,
  amount: string,
  saleDate: string | null = null,
) => ({ securityId, purchaseDate, amount, saleDate, price: '1.000000', sequence: 1 });

describe('DividendHistoryService.getDividendHistory', () => {
  const purchaseDateBalanceRepository = { find: vi.fn() };
  const securityRepository = { findBy: vi.fn() };
  const dividendRepository = { find: vi.fn() };
  const dailyExchangeRateRepository = { findOne: vi.fn() };
  const securityRefreshService = { refresh: vi.fn() };
  let service: DividendHistoryService;

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        DividendHistoryService,
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
        { provide: SecurityRefreshService, useValue: securityRefreshService },
      ],
    }).compile();
    service = moduleRef.get(DividendHistoryService);
    securityRepository.findBy.mockResolvedValue([KRW_SECURITY, USD_SECURITY]);
  });

  it('보유했던 종목이 없으면 빈 내역을 돌려준다', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([]);

    const result = await service.getDividendHistory({ id: 1 }, {});

    expect(result).toEqual({
      from: null,
      to: null,
      total: { krwAmount: '0', usdAmount: '0.000000', usdKrwAmount: '0', totalKrwAmount: '0' },
      months: [],
    });
    expect(dividendRepository.find).not.toHaveBeenCalled();
    expect(securityRefreshService.refresh).not.toHaveBeenCalled();
  });

  it('기준일 보유 수량 × 주당 배당금으로 계산하고 USD는 지급일 이전 최근 환율로 환산해 월별로 묶는다', async () => {
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

    const result = await service.getDividendHistory(
      { id: 1 },
      { from: '2026-04-01', to: '2026-06-30' },
    );

    // 배당을 읽기 전에 보유했던 종목마다 온라인 갱신
    expect(securityRefreshService.refresh.mock.calls).toEqual([
      [KRW_SECURITY],
      [USD_SECURITY],
    ]);
    expect(securityRefreshService.refresh.mock.invocationCallOrder[1]).toBeLessThan(
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
        summary: { krwAmount: '4693', usdAmount: '0.000000', usdKrwAmount: '0', totalKrwAmount: '4693' },
        items: [
          {
            securityId: KRW_SECURITY.id,
            name: '삼성전자',
            currency: Currency.KRW,
            noticeDate: '2026-03-31',
            paymentDate: '2026-04-20',
            perShareAmount: '361',
            quantity: '13',
            amount: '4693',
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
        summary: { krwAmount: '0', usdAmount: '0.650000', usdKrwAmount: '910', totalKrwAmount: '910' },
        items: [
          {
            securityId: USD_SECURITY.id,
            name: 'Apple',
            currency: Currency.USD,
            noticeDate: '2026-05-11',
            paymentDate: '2026-05-16',
            perShareAmount: '0.260000',
            quantity: '2.500000',
            amount: '0.650000',
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

    const result = await service.getDividendHistory({ id: 1 }, { from: '2026-01-01' });

    expect(dividendRepository.find.mock.calls[0][0].where.paymentDate).toEqual(
      MoreThanOrEqual('2026-01-01'),
    );
    expect(result.months[0].items[0]).toMatchObject({
      usdAmount: '0.250000',
      krwAmount: null,
      exchangeRate: null,
      exchangeRateDate: null,
    });
    expect(result.total).toEqual({
      krwAmount: '0',
      usdAmount: '0.250000',
      usdKrwAmount: '0',
      totalKrwAmount: '0',
    });
  });

  it('기간이 없으면 지급일 조건 없이 전체를 조회한다', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([
      purchase(KRW_SECURITY.id, '2026-01-02', '1.000000'),
    ]);
    dividendRepository.find.mockResolvedValue([]);

    await service.getDividendHistory({ id: 1 }, {});

    expect(dividendRepository.find.mock.calls[0][0].where).not.toHaveProperty('paymentDate');
  });
});
