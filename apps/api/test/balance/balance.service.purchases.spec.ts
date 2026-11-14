import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LessThanOrEqual } from 'typeorm';
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
import { purchaseHistorySchema } from '../../src/balance/purchase-history.schema.js';

const AAPL = { id: 'US0378331005', symbol: 'AAPL', name: '애플', currency: Currency.USD };
const REIT = { id: 'KR7476800008', symbol: '476800', name: '리츠', currency: Currency.KRW };

describe('BalanceService.getPurchases', () => {
  const purchaseDateBalanceRepository = { find: vi.fn() };
  const securityRepository = { findOneBy: vi.fn() };
  const dailyExchangeRateRepository = { findOne: vi.fn() };
  let service: BalanceService;

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BalanceService,
        { provide: getRepositoryToken(PurchaseDateBalance), useValue: purchaseDateBalanceRepository },
        { provide: getRepositoryToken(Security), useValue: securityRepository },
        { provide: getRepositoryToken(DailyExchangeRate), useValue: dailyExchangeRateRepository },
        { provide: getRepositoryToken(UserBalance), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(DailySecurity), useValue: {} },
        { provide: SecurityRefreshService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(BalanceService);
  });

  it('USD 종목은 매수일 최신순으로 수량·매수가·매도일과 매수일(이전 최근) 환율을 돌려준다', async () => {
    securityRepository.findOneBy.mockResolvedValue({ ...AAPL, shortenedName: '애플' });
    purchaseDateBalanceRepository.find.mockResolvedValue([
      { purchaseDate: '2026-02-07', sequence: 2, amount: '1.500000', price: '230.120000', saleDate: null },
      { purchaseDate: '2026-02-07', sequence: 1, amount: '2.000000', price: '231.000000', saleDate: '2026-05-01' },
      { purchaseDate: '2026-01-02', sequence: 1, amount: '10.000000', price: '271.010000', saleDate: null },
    ]);
    dailyExchangeRateRepository.findOne.mockImplementation(
      ({ where }: { where: { date: { value: string } } }) =>
        Promise.resolve(
          where.date.value === '2026-02-07'
            ? { date: '2026-02-06', closingRate: '1445.100000' } // 토요일 → 금요일
            : { date: '2026-01-02', closingRate: '1441.570000' },
        ),
    );

    const result = await service.getPurchases({ id: 6 }, { securityId: AAPL.id });

    expect(purchaseDateBalanceRepository.find).toHaveBeenCalledWith({
      where: { userId: 6, securityId: AAPL.id },
      order: { purchaseDate: 'DESC', sequence: 'DESC' },
    });
    // 같은 매수일은 한 번만 조회
    expect(dailyExchangeRateRepository.findOne).toHaveBeenCalledTimes(2);
    expect(dailyExchangeRateRepository.findOne).toHaveBeenCalledWith({
      where: { currency: Currency.USD, date: LessThanOrEqual('2026-02-07') },
      order: { date: 'DESC' },
    });
    expect(result).toEqual({
      security: AAPL,
      items: [
        { purchaseDate: '2026-02-07', sequence: 2, amount: '1.500000', price: '230.12', saleDate: null, exchangeRate: '1445.1', exchangeRateDate: '2026-02-06' },
        { purchaseDate: '2026-02-07', sequence: 1, amount: '2.000000', price: '231.00', saleDate: '2026-05-01', exchangeRate: '1445.1', exchangeRateDate: '2026-02-06' },
        { purchaseDate: '2026-01-02', sequence: 1, amount: '10.000000', price: '271.01', saleDate: null, exchangeRate: '1441.57', exchangeRateDate: '2026-01-02' },
      ],
    });
  });

  it('KRW 종목은 정수로 버리고 환율은 null (환율 조회 안 함)', async () => {
    securityRepository.findOneBy.mockResolvedValue(REIT);
    purchaseDateBalanceRepository.find.mockResolvedValue([
      { purchaseDate: '2026-01-02', sequence: 1, amount: '5000.000000', price: '4900.000000', saleDate: null },
    ]);

    const result = await service.getPurchases({ id: 6 }, { securityId: REIT.id });

    expect(dailyExchangeRateRepository.findOne).not.toHaveBeenCalled();
    expect(result.items).toEqual([
      { purchaseDate: '2026-01-02', sequence: 1, amount: '5000', price: '4900', saleDate: null, exchangeRate: null, exchangeRateDate: null },
    ]);
  });

  it('매수 내역이 없으면 빈 목록, 종목이 없으면 404', async () => {
    securityRepository.findOneBy.mockResolvedValueOnce(REIT);
    purchaseDateBalanceRepository.find.mockResolvedValue([]);
    await expect(service.getPurchases({ id: 6 }, { securityId: REIT.id })).resolves.toEqual({
      security: REIT,
      items: [],
    });

    securityRepository.findOneBy.mockResolvedValueOnce(null);
    await expect(
      service.getPurchases({ id: 6 }, { securityId: 'NOPE' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('purchaseHistorySchema', () => {
  it('securityId 앞뒤 공백을 지우고, 없거나 공백뿐이면 거절한다', () => {
    expect(purchaseHistorySchema.parse({ securityId: ' US0378331005 ' })).toEqual({
      securityId: 'US0378331005',
    });
    expect(purchaseHistorySchema.safeParse({}).success).toBe(false);
    expect(purchaseHistorySchema.safeParse({ securityId: ' ' }).success).toBe(false);
  });
});
