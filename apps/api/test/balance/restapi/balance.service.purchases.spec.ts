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
  SecurityCompany,
  User,
  UserBalance,
} from '@app/common';
import { SecurityRefresher } from '../../../src/security/security.refresher.js';
import { ACCOUNT, accountProviders } from '../account-providers.js';

// 1: 키움, 2: 토스, 3: 미래에셋, 4: NH (모두 일반 계좌)
const ACCOUNTS = [
  ACCOUNT,
  { ...ACCOUNT, id: 2, securityCompany: SecurityCompany.TOSS },
  { ...ACCOUNT, id: 3, securityCompany: SecurityCompany.MIRAE_ASSET },
  { ...ACCOUNT, id: 4, securityCompany: SecurityCompany.NH_INVESTMENT },
];
const amountOf = (id: number, amount: string) => ({
  accountId: id,
  securityCompany: ACCOUNTS[id - 1].securityCompany,
  accountType: 'NORMAL',
  amount,
});
import { BalanceService } from '../../../src/balance/restapi/balance.service.js';
import { PurchaseRateReader } from '../../../src/balance/purchase-rate.reader.js';
import { PurchaseWriter } from '../../../src/balance/purchase.writer.js';
import { DailyPriceReader } from '../../../src/security/daily-price.reader.js';
import { ExchangeRateReader } from '../../../src/security/exchange-rate.reader.js';
import { purchaseHistorySchema } from '../../../src/balance/restapi/dto/purchase-history.schema.js';

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
        DailyPriceReader,
        ExchangeRateReader,
        PurchaseRateReader,
        PurchaseWriter,
        ...accountProviders(ACCOUNTS),
        { provide: getRepositoryToken(PurchaseDateBalance), useValue: purchaseDateBalanceRepository },
        { provide: getRepositoryToken(Security), useValue: securityRepository },
        { provide: getRepositoryToken(DailyExchangeRate), useValue: dailyExchangeRateRepository },
        { provide: getRepositoryToken(UserBalance), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(DailySecurity), useValue: {} },
        { provide: SecurityRefresher, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(BalanceService);
  });

  it('USD 종목은 매수일 최신순으로 수량·매수가·매도일과 매수일(이전 최근) 환율을 돌려준다', async () => {
    securityRepository.findOneBy.mockResolvedValue({ ...AAPL, shortenedName: '애플' });
    purchaseDateBalanceRepository.find.mockResolvedValue([
      { purchaseDate: '2026-02-07', sequence: 2, accountId: 2, amount: '1.500000', price: '230.120000', saleDate: null },
      { purchaseDate: '2026-02-07', sequence: 1, accountId: 1, amount: '2.000000', price: '231.000000', saleDate: '2026-05-01' },
      { purchaseDate: '2026-01-02', sequence: 1, accountId: 2, amount: '10.000000', price: '271.010000', saleDate: null },
    ]);
    dailyExchangeRateRepository.findOne.mockImplementation(
      ({ where }: { where: { date: { value: string } } }) =>
        Promise.resolve(
          where.date.value === '2026-02-07'
            ? { date: '2026-02-06', closingRate: '1445.100000' } // 토요일 → 금요일
            : { date: '2026-01-02', closingRate: '1441.570000' },
        ),
    );

    const result = await service.getPurchases({ id: 6, rules: [] }, { securityId: AAPL.id });

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
      // 보유 수량은 미매도분만 (매도한 1번 계좌 2주 제외)
      amount: '11.500000',
      accountAmounts: [amountOf(2, '11.500000')],
      items: [
        { purchaseDate: '2026-02-07', sequence: 2, accountId: 2, securityCompany: 'TOSS', accountType: 'NORMAL', amount: '1.500000', price: '230.12', saleDate: null, exchangeRate: '1445.1', exchangeRateDate: '2026-02-06' },
        { purchaseDate: '2026-02-07', sequence: 1, accountId: 1, securityCompany: 'KIWOOM', accountType: 'NORMAL', amount: '2.000000', price: '231.00', saleDate: '2026-05-01', exchangeRate: '1445.1', exchangeRateDate: '2026-02-06' },
        { purchaseDate: '2026-01-02', sequence: 1, accountId: 2, securityCompany: 'TOSS', accountType: 'NORMAL', amount: '10.000000', price: '271.01', saleDate: null, exchangeRate: '1441.57', exchangeRateDate: '2026-01-02' },
      ],
    });
  });

  it('USD 매수분에 저장된 환율이 있으면 그 환율(기준일 null), 없으면 매수일 환율을 돌려준다', async () => {
    securityRepository.findOneBy.mockResolvedValue(AAPL);
    purchaseDateBalanceRepository.find.mockResolvedValue([
      { purchaseDate: '2026-02-07', sequence: 1, accountId: 1, amount: '1.000000', price: '230.000000', saleDate: null, exchangeRate: '1430.250000' },
      { purchaseDate: '2026-01-02', sequence: 1, accountId: 1, amount: '1.000000', price: '271.000000', saleDate: null, exchangeRate: null },
    ]);
    dailyExchangeRateRepository.findOne.mockResolvedValue({
      date: '2026-01-02',
      closingRate: '1441.570000',
    });

    const result = await service.getPurchases({ id: 6, rules: [] }, { securityId: AAPL.id });

    expect(dailyExchangeRateRepository.findOne).toHaveBeenCalledTimes(1);
    expect(result.items.map(({ exchangeRate, exchangeRateDate }) => ({ exchangeRate, exchangeRateDate }))).toEqual([
      { exchangeRate: '1430.25', exchangeRateDate: null },
      { exchangeRate: '1441.57', exchangeRateDate: '2026-01-02' },
    ]);
  });

  it('KRW 종목은 정수로 버리고 환율은 null (환율 조회 안 함)', async () => {
    securityRepository.findOneBy.mockResolvedValue(REIT);
    purchaseDateBalanceRepository.find.mockResolvedValue([
      { purchaseDate: '2026-01-02', sequence: 1, accountId: 3, amount: '5000.000000', price: '4900.000000', saleDate: null },
    ]);

    const result = await service.getPurchases({ id: 6, rules: [] }, { securityId: REIT.id });

    expect(dailyExchangeRateRepository.findOne).not.toHaveBeenCalled();
    expect(result.items).toEqual([
      { purchaseDate: '2026-01-02', sequence: 1, accountId: 3, securityCompany: 'MIRAE_ASSET', accountType: 'NORMAL', amount: '5000', price: '4900', saleDate: null, exchangeRate: null, exchangeRateDate: null },
    ]);
  });

  it('보유 수량을 전체·계좌별(계좌 id 순)로 나누고, 매도분과 수량 0인 계좌는 뺀다', async () => {
    securityRepository.findOneBy.mockResolvedValue(REIT);
    purchaseDateBalanceRepository.find.mockResolvedValue([
      { purchaseDate: '2026-03-02', sequence: 1, accountId: 2, amount: '7.000000', price: '4900.000000', saleDate: null },
      { purchaseDate: '2026-02-02', sequence: 1, accountId: 4, amount: '4.000000', price: '4900.000000', saleDate: '2026-04-01' },
      { purchaseDate: '2026-01-02', sequence: 2, accountId: 3, amount: '3.000000', price: '4900.000000', saleDate: null },
      { purchaseDate: '2026-01-02', sequence: 1, accountId: 2, amount: '5.000000', price: '4900.000000', saleDate: null },
    ]);

    const result = await service.getPurchases({ id: 6, rules: [] }, { securityId: REIT.id });

    expect(result.amount).toBe('15');
    expect(result.accountAmounts).toEqual([amountOf(2, '12'), amountOf(3, '3')]);
    expect(result.items).toHaveLength(4);
  });

  it('accountId를 주면 그 계좌 매수분만 조회한다', async () => {
    securityRepository.findOneBy.mockResolvedValue(REIT);
    purchaseDateBalanceRepository.find.mockResolvedValue([]);

    await service.getPurchases(
      { id: 6, rules: [] },
      { securityId: REIT.id, accountId: 2 },
    );

    expect(purchaseDateBalanceRepository.find).toHaveBeenCalledWith({
      where: { userId: 6, securityId: REIT.id, accountId: 2 },
      order: { purchaseDate: 'DESC', sequence: 'DESC' },
    });
  });

  it('accountId가 없으면 전체 계좌로 조회한다', async () => {
    securityRepository.findOneBy.mockResolvedValue(REIT);
    purchaseDateBalanceRepository.find.mockResolvedValue([]);

    await service.getPurchases({ id: 6, rules: [] }, { securityId: REIT.id });

    expect(purchaseDateBalanceRepository.find).toHaveBeenCalledWith({
      where: { userId: 6, securityId: REIT.id },
      order: { purchaseDate: 'DESC', sequence: 'DESC' },
    });
  });

  it('매수 내역이 없으면 빈 목록, 종목이 없으면 404', async () => {
    securityRepository.findOneBy.mockResolvedValueOnce(REIT);
    purchaseDateBalanceRepository.find.mockResolvedValue([]);
    await expect(service.getPurchases({ id: 6, rules: [] }, { securityId: REIT.id })).resolves.toEqual({
      security: REIT,
      amount: '0',
      accountAmounts: [],
      items: [],
    });

    securityRepository.findOneBy.mockResolvedValueOnce(null);
    await expect(
      service.getPurchases({ id: 6, rules: [] }, { securityId: 'NOPE' }),
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

  it('accountId는 선택이고 숫자로 바꾸며, 양의 정수가 아니면 거절한다', () => {
    expect(
      purchaseHistorySchema.parse({ securityId: 'US0378331005', accountId: '2' }),
    ).toEqual({ securityId: 'US0378331005', accountId: 2 });
    expect(
      purchaseHistorySchema.safeParse({ securityId: 'US0378331005', accountId: '0' })
        .success,
    ).toBe(false);
  });
});
