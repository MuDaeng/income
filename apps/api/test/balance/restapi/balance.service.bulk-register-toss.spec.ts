import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { Between, In } from 'typeorm';
import {
  Currency,
  DailyExchangeRate,
  DailySecurity,
  PurchaseDateBalance,
  Security,
  UserBalance,
} from '@app/common';
import { SecurityRefresher } from '../../../src/security/security.refresher.js';
import { accountProviders } from '../account-providers.js';
import { BalanceService } from '../../../src/balance/restapi/balance.service.js';
import { PurchaseRateReader } from '../../../src/balance/purchase-rate.reader.js';
import { PurchaseWriter } from '../../../src/balance/purchase.writer.js';
import { DailyPriceReader } from '../../../src/security/daily-price.reader.js';
import { ExchangeRateReader } from '../../../src/security/exchange-rate.reader.js';
import type { TossTransactionRequest } from '../../../src/balance/restapi/dto/bulk-register-balance-toss.schema.js';

// 단위 테스트에서는 트랜잭션 컨텍스트 없이 메서드만 실행
vi.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

const KR_ISIN = 'KR7005930003';
const US_ISIN = 'US0378331005';

const krBuy = (
  overrides: Partial<TossTransactionRequest> = {},
): TossTransactionRequest => ({
  transactionType: 'BUY',
  marketCountry: 'KR',
  currency: 'KRW',
  symbol: '005930',
  assetClass: 'STOCK',
  isinCode: KR_ISIN,
  quantity: '3',
  filledPrice: '70000.7',
  exchangeRate: null,
  settlementDate: '2026-10-20',
  settled: true,
  transactionTime: '2026-10-16T10:00:00+09:00',
  isCancellation: false,
  ...overrides,
});

const usBuy = (
  overrides: Partial<TossTransactionRequest> = {},
): TossTransactionRequest =>
  krBuy({
    marketCountry: 'US',
    currency: 'USD',
    symbol: 'AAPL',
    isinCode: US_ISIN,
    quantity: '0.1234567',
    filledPrice: '189.1234567',
    exchangeRate: '1386.1234567',
    transactionTime: '2026-10-16T06:30:00+09:00',
    ...overrides,
  });

const user = { id: 1, rules: [] };

describe('BalanceService.bulkRegisterToss', () => {
  const securityRepository = { findBy: vi.fn() };
  const exchangeRateRepository = { findOne: vi.fn() };
  const dailySecurityRepository = { findOne: vi.fn(), find: vi.fn() };
  const purchaseWriter = {
    lockOwner: vi.fn(),
    removeByAccount: vi.fn(),
    append: vi.fn(),
    sellLifo: vi.fn(),
  };
  let service: BalanceService;

  beforeEach(async () => {
    vi.resetAllMocks();
    purchaseWriter.removeByAccount.mockResolvedValue(5);
    securityRepository.findBy.mockResolvedValue([
      { id: KR_ISIN, currency: Currency.KRW },
      { id: US_ISIN, currency: Currency.USD },
    ]);
    exchangeRateRepository.findOne.mockResolvedValue(null);
    // 저장된 거래일 없음 → 평일 계산
    dailySecurityRepository.find.mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        BalanceService,
        DailyPriceReader,
        ExchangeRateReader,
        PurchaseRateReader,
        { provide: PurchaseWriter, useValue: purchaseWriter },
        ...accountProviders(),
        { provide: getRepositoryToken(PurchaseDateBalance), useValue: {} },
        { provide: getRepositoryToken(UserBalance), useValue: {} },
        { provide: getRepositoryToken(Security), useValue: securityRepository },
        { provide: SecurityRefresher, useValue: {} },
        {
          provide: getRepositoryToken(DailySecurity),
          useValue: dailySecurityRepository,
        },
        {
          provide: getRepositoryToken(DailyExchangeRate),
          useValue: exchangeRateRepository,
        },
      ],
    }).compile();
    service = moduleRef.get(BalanceService);
  });

  it('사용자를 잠근 뒤 Toss 계좌(입력이 없으면 첫 Toss 계좌)의 매수분을 모두 지운다', async () => {
    const result = await service.bulkRegisterToss(user, { confirmedTransfersOut: [], transactionList: [] });

    expect(purchaseWriter.lockOwner).toHaveBeenCalledWith(1);
    expect(purchaseWriter.removeByAccount).toHaveBeenCalledWith(1, 1);
    expect(securityRepository.findBy).not.toHaveBeenCalled();
    expect(dailySecurityRepository.find).not.toHaveBeenCalled();
    expect(result).toEqual({
      accountId: 1,
      deletedCount: 5,
      boughtCount: 0,
      soldCount: 0,
      skipped: [],
      lentTransfers: [],
    });
  });

  it('accountId를 주면 그 계좌를 다시 만든다', async () => {
    const result = await service.bulkRegisterToss(user, {
      accountId: 7,
      confirmedTransfersOut: [],
      transactionList: [],
    });

    expect(purchaseWriter.removeByAccount).toHaveBeenCalledWith(1, 7);
    expect(result.accountId).toBe(7);
  });

  it('국내 BUY는 결제일 2거래일 전 체결일로 시세 검증 없이 정수로 버려 등록하고 환율은 null', async () => {
    await service.bulkRegisterToss(user, { confirmedTransfersOut: [], transactionList: [krBuy()] });

    expect(securityRepository.findBy).toHaveBeenCalledWith({
      id: In([KR_ISIN]),
    });
    expect(purchaseWriter.append).toHaveBeenCalledWith({
      userId: 1,
      securityId: KR_ISIN,
      purchaseDate: '2026-10-16',
      accountId: 1,
      amount: '3',
      price: '70000',
      saleDate: null,
      exchangeRate: null,
    });
  });

  it('미국 BUY도 결제일 2거래일 전 체결일, 소수 6자리로 버리고 입력 환율을 쓴다', async () => {
    await service.bulkRegisterToss(user, { confirmedTransfersOut: [], transactionList: [usBuy()] });

    expect(purchaseWriter.append).toHaveBeenCalledWith(
      expect.objectContaining({
        securityId: US_ISIN,
        purchaseDate: '2026-10-16',
        amount: '0.123456',
        price: '189.123456',
        exchangeRate: '1386.123456',
      }),
    );
    expect(exchangeRateRepository.findOne).not.toHaveBeenCalled();
  });

  it('미국 BUY에 환율이 없으면 매수일 이전 최근 USD 환율을 쓴다', async () => {
    exchangeRateRepository.findOne.mockResolvedValue({
      closingRate: '1400.5000009',
    });

    await service.bulkRegisterToss(user, {
      confirmedTransfersOut: [],
      transactionList: [usBuy({ exchangeRate: null })],
    });

    expect(purchaseWriter.append).toHaveBeenCalledWith(
      expect.objectContaining({ exchangeRate: '1400.500000' }),
    );
  });

  it('transactionTime과 무관하게 결제일에서 평일 2일 앞당긴다 (주말 건너뜀)', async () => {
    await service.bulkRegisterToss(user, {
      confirmedTransfersOut: [],
      transactionList: [
        // 월요일 결제 → 지난주 목요일 체결
        krBuy({ settlementDate: '2026-10-19', transactionTime: null }),
      ],
    });

    expect(purchaseWriter.append).toHaveBeenCalledWith(
      expect.objectContaining({ purchaseDate: '2026-10-15' }),
    );
  });

  it('저장된 국내 거래일이 결제일을 덮으면 휴장일을 건너뛰고, 거래일은 결제일 범위로 한 번만 읽는다', async () => {
    // 10-16(금) 휴장
    dailySecurityRepository.find.mockResolvedValue(
      ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-19', '2026-10-20', '2026-10-21'].map(
        (date) => ({ date }),
      ),
    );

    await service.bulkRegisterToss(user, {
      confirmedTransfersOut: [],
      transactionList: [
        krBuy({ settlementDate: '2026-10-21' }),
        krBuy({ settlementDate: '2026-10-20' }),
      ],
    });

    expect(dailySecurityRepository.find).toHaveBeenCalledTimes(1);
    expect(dailySecurityRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: Between('2026-10-06', '2026-10-21'),
        }),
      }),
    );
    const dates = purchaseWriter.append.mock.calls.map(
      ([arg]: [{ purchaseDate: string }]) => arg.purchaseDate,
    );
    // 10-20 → 10-19, 10-15 / 10-21 → 10-20, 10-19 (날짜 오름차순으로 등록)
    expect(dates).toEqual(['2026-10-15', '2026-10-19']);
  });

  it('BUY를 날짜 오름차순으로 모두 등록한 뒤 SELL을 날짜 오름차순으로 LIFO 매도한다', async () => {
    const calls: string[] = [];
    purchaseWriter.append.mockImplementation(({ purchaseDate }) => {
      calls.push(`BUY ${purchaseDate}`);
      return Promise.resolve({});
    });
    purchaseWriter.sellLifo.mockImplementation(
      (_u, _s, _c, _a, saleDate: string) => {
        calls.push(`SELL ${saleDate}`);
        return Promise.resolve([]);
      },
    );

    // Toss는 최신순으로 준다
    const result = await service.bulkRegisterToss(user, {
      confirmedTransfersOut: [],
      transactionList: [
        krBuy({ transactionType: 'SELL', settlementDate: '2026-10-26' }),
        krBuy({ settlementDate: '2026-10-23' }),
        krBuy({ transactionType: 'SELL', settlementDate: '2026-10-21' }),
        krBuy({ settlementDate: '2026-10-20' }),
      ],
    });

    expect(calls).toEqual([
      'BUY 2026-10-16',
      'BUY 2026-10-21',
      'SELL 2026-10-19',
      'SELL 2026-10-22',
    ]);
    expect(result).toMatchObject({ boughtCount: 2, soldCount: 2 });
  });

  it('SELL은 그 계좌 매수분에서 종목 통화로 버린 수량만큼 매도한다', async () => {
    await service.bulkRegisterToss(user, {
      confirmedTransfersOut: [],
      transactionList: [usBuy({ transactionType: 'SELL', filledPrice: null })],
    });

    expect(purchaseWriter.sellLifo).toHaveBeenCalledWith(
      1,
      1,
      US_ISIN,
      new Decimal('0.123456'),
      '2026-10-16',
      Currency.USD,
    );
  });

  it('보유 부족으로 매도가 실패하면 그대로 던진다(전체 롤백)', async () => {
    purchaseWriter.sellLifo.mockRejectedValue(
      new BadRequestException('매도 수량이 보유 수량보다 많습니다.'),
    );

    await expect(
      service.bulkRegisterToss(user, {
        confirmedTransfersOut: [],
        transactionList: [krBuy({ transactionType: 'SELL' })],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('SECURITIES_TRANSFER_IN은 입고일 이전 최근 종가를 매수가로 등록한다', async () => {
    dailySecurityRepository.findOne.mockResolvedValue({
      closingPrice: '72.4567891',
    });

    const result = await service.bulkRegisterToss(user, {
      confirmedTransfersOut: [],
      transactionList: [
        usBuy({
          transactionType: 'SECURITIES_TRANSFER_IN',
          quantity: '0.000496',
          filledPrice: null,
          exchangeRate: null,
        }),
      ],
    });

    expect(dailySecurityRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: US_ISIN }),
        order: { date: 'DESC' },
      }),
    );
    expect(purchaseWriter.append).toHaveBeenCalledWith(
      expect.objectContaining({
        securityId: US_ISIN,
        purchaseDate: '2026-10-16',
        amount: '0.000496',
        price: '72.456789',
      }),
    );
    expect(result).toMatchObject({ boughtCount: 1, skipped: [] });
  });

  it('SECURITIES_TRANSFER_IN의 시세가 없으면 건너뛴다', async () => {
    dailySecurityRepository.findOne.mockResolvedValue(null);

    const result = await service.bulkRegisterToss(user, {
      confirmedTransfersOut: [],
      transactionList: [
        krBuy({ transactionType: 'SECURITIES_TRANSFER_IN', filledPrice: null }),
      ],
    });

    expect(purchaseWriter.append).not.toHaveBeenCalled();
    expect(result.skipped).toEqual([
      {
        transactionType: 'SECURITIES_TRANSFER_IN',
        isinCode: KR_ISIN,
        reason: '입고일 시세 없음',
      },
    ]);
  });

  it('입고분을 매수분과 함께 먼저 등록하고, 실제 출고로 지정한 SECURITIES_TRANSFER_OUT은 SELL처럼 LIFO 매도한다', async () => {
    dailySecurityRepository.findOne.mockResolvedValue({ closingPrice: '71000' });
    const calls: string[] = [];
    purchaseWriter.append.mockImplementation(({ purchaseDate, amount }) => {
      calls.push(`BUY ${purchaseDate} ${amount}`);
      return Promise.resolve({});
    });
    purchaseWriter.sellLifo.mockImplementation(
      (_u, _s, _c, amount: Decimal, saleDate: string) => {
        calls.push(`SELL ${saleDate} ${amount.toString()}`);
        return Promise.resolve([]);
      },
    );

    const result = await service.bulkRegisterToss(user, {
      confirmedTransfersOut: [
        { isinCode: KR_ISIN, settlementDate: '2026-10-26', quantity: '1', index: 0 },
      ],
      transactionList: [
        krBuy({
          transactionType: 'SECURITIES_TRANSFER_OUT',
          quantity: '1',
          filledPrice: null,
          settlementDate: '2026-10-26',
        }),
        krBuy({ transactionType: 'SELL', quantity: '4', settlementDate: '2026-10-22' }),
        krBuy({
          transactionType: 'SECURITIES_TRANSFER_IN',
          quantity: '2',
          filledPrice: null,
          settlementDate: '2026-10-21',
        }),
        krBuy({ settlementDate: '2026-10-20' }),
      ],
    });

    expect(calls).toEqual([
      'BUY 2026-10-16 3',
      'BUY 2026-10-19 2',
      'SELL 2026-10-20 4',
      'SELL 2026-10-22 1',
    ]);
    expect(result).toMatchObject({ boughtCount: 2, soldCount: 2 });
  });

  it('취소·없는 종목·수량/단가 없는 거래는 건너뛰고, 매수·매도·입출고 외 유형은 무시한다', async () => {
    const result = await service.bulkRegisterToss(user, {
      confirmedTransfersOut: [],
      transactionList: [
        krBuy({ isCancellation: true }),
        krBuy({ isinCode: 'KR0000000000' }),
        krBuy({ isinCode: null }),
        krBuy({ quantity: null }),
        krBuy({ filledPrice: null }),
        krBuy({ transactionType: 'SELL', quantity: null }),
        krBuy({ transactionType: 'DIVIDEND' }),
        krBuy({ transactionType: 'SPLIT' }),
      ],
    });

    expect(purchaseWriter.append).not.toHaveBeenCalled();
    expect(purchaseWriter.sellLifo).not.toHaveBeenCalled();
    expect(result.skipped).toEqual([
      { transactionType: 'BUY', isinCode: KR_ISIN, reason: '취소 거래' },
      { transactionType: 'BUY', isinCode: 'KR0000000000', reason: '종목을 찾을 수 없음' },
      { transactionType: 'BUY', isinCode: null, reason: '종목을 찾을 수 없음' },
      { transactionType: 'BUY', isinCode: KR_ISIN, reason: '수량 또는 단가 없음' },
      { transactionType: 'BUY', isinCode: KR_ISIN, reason: '수량 또는 단가 없음' },
      { transactionType: 'SELL', isinCode: KR_ISIN, reason: '수량 또는 단가 없음' },
    ]);
  });

  describe('주식 빌려주기', () => {
    const transfer = (
      transactionType: 'SECURITIES_TRANSFER_IN' | 'SECURITIES_TRANSFER_OUT',
      quantity: string,
      settlementDate: string,
    ) => krBuy({ transactionType, quantity, settlementDate, filledPrice: null });

    beforeEach(() => {
      dailySecurityRepository.findOne.mockResolvedValue({ closingPrice: '71000' });
    });

    it('빌려주기 출고 후 반환 입고는 서로 상쇄해 매도·매수하지 않는다', async () => {
      const result = await service.bulkRegisterToss(user, {
        confirmedTransfersOut: [],
        transactionList: [
          transfer('SECURITIES_TRANSFER_IN', '10', '2026-10-26'),
          transfer('SECURITIES_TRANSFER_OUT', '10', '2026-10-20'),
          krBuy({ quantity: '10', settlementDate: '2026-10-01' }),
        ],
      });

      // 원래 매수분만 등록 (반환 입고를 종가로 다시 사지 않음)
      expect(purchaseWriter.append).toHaveBeenCalledTimes(1);
      expect(purchaseWriter.sellLifo).not.toHaveBeenCalled();
      expect(result.skipped).toEqual([
        { transactionType: 'SECURITIES_TRANSFER_IN', isinCode: KR_ISIN, reason: '빌려주기 반환' },
        { transactionType: 'SECURITIES_TRANSFER_OUT', isinCode: KR_ISIN, reason: '빌려주기 출고(반환됨)' },
      ]);
      expect(result.lentTransfers).toEqual([]);
    });

    it('반환되지 않은 출고는 대여 중으로 보고 매도하지 않으며 lentTransfers로 돌려준다', async () => {
      const result = await service.bulkRegisterToss(user, {
        confirmedTransfersOut: [],
        transactionList: [
          transfer('SECURITIES_TRANSFER_IN', '4', '2026-10-26'),
          transfer('SECURITIES_TRANSFER_OUT', '10', '2026-10-20'),
        ],
      });

      expect(purchaseWriter.append).not.toHaveBeenCalled();
      expect(purchaseWriter.sellLifo).not.toHaveBeenCalled();
      expect(result.lentTransfers).toEqual([
        {
          key: { isinCode: KR_ISIN, settlementDate: '2026-10-20', quantity: '10', index: 0 },
          remainingQuantity: '6',
        },
      ]);
    });

    it('반환 수량보다 많이 들어온 입고분만 종가로 매수 등록한다', async () => {
      const result = await service.bulkRegisterToss(user, {
        confirmedTransfersOut: [],
        transactionList: [
          transfer('SECURITIES_TRANSFER_IN', '12', '2026-10-26'),
          transfer('SECURITIES_TRANSFER_OUT', '10', '2026-10-20'),
        ],
      });

      expect(purchaseWriter.append).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '2', price: '71000' }),
      );
      expect(result).toMatchObject({ boughtCount: 1, soldCount: 0, lentTransfers: [] });
    });
  });
});
