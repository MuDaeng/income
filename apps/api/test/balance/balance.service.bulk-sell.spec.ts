import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual } from 'typeorm';
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
import { SecurityRefresher } from '../../src/security/security.refresher.js';
import { BalanceService } from '../../src/balance/balance.service.js';
import { PurchaseRateReader } from '../../src/balance/purchase-rate.reader.js';
import { DailyPriceReader } from '../../src/security/daily-price.reader.js';
import { ExchangeRateReader } from '../../src/security/exchange-rate.reader.js';

// 단위 테스트에서는 트랜잭션 컨텍스트 없이 메서드만 실행
vi.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

const row = (purchaseDate: string, sequence: number, amount: string) => ({
  userId: 1,
  securityId: '005930',
  purchaseDate,
  sequence,
  securityCompany: SecurityCompany.KIWOOM,
  amount,
  price: '70000.000000',
  saleDate: null as string | null,
  exchangeRate: null,
});
const input = (amount: string) => ({
  securityId: '005930',
  securityCompany: SecurityCompany.KIWOOM,
  amount,
  saleDate: '2026-11-08',
});

describe('BalanceService.bulkSellBalance', () => {
  const purchaseDateBalanceRepository = {
    find: vi.fn(),
    findOne: vi.fn(),
    save: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  };
  const userRepository = { findOne: vi.fn() };
  const securityRepository = { findOneBy: vi.fn() };
  let service: BalanceService;

  beforeEach(async () => {
    vi.resetAllMocks();
    userRepository.findOne.mockResolvedValue({ id: 1 });
    securityRepository.findOneBy.mockResolvedValue({
      id: '005930',
      currency: Currency.KRW,
    });
    // 같은 매도 행·마지막 sequence 조회는 기본으로 없음
    purchaseDateBalanceRepository.findOne.mockResolvedValue(null);
    purchaseDateBalanceRepository.save.mockImplementation((value: object) =>
      Promise.resolve({ ...value }),
    );
    purchaseDateBalanceRepository.create.mockImplementation(
      (value: object) => value,
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        BalanceService,
        DailyPriceReader,
        ExchangeRateReader,
        PurchaseRateReader,
        {
          provide: getRepositoryToken(PurchaseDateBalance),
          useValue: purchaseDateBalanceRepository,
        },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Security), useValue: securityRepository },
        { provide: SecurityRefresher, useValue: {} },
        { provide: getRepositoryToken(UserBalance), useValue: {} },
        { provide: getRepositoryToken(DailySecurity), useValue: {} },
        { provide: getRepositoryToken(DailyExchangeRate), useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(BalanceService);
  });

  it('그 증권사의 미매도·매도일 이전 매수분을 매수일 오래된 순으로 조회한다', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([
      row('2026-11-01', 1, '5'),
    ]);

    await service.bulkSellBalance({ id: 1 }, input('1'));

    expect(purchaseDateBalanceRepository.find).toHaveBeenCalledWith({
      where: {
        userId: 1,
        securityId: '005930',
        securityCompany: SecurityCompany.KIWOOM,
        saleDate: IsNull(),
        purchaseDate: LessThanOrEqual('2026-11-08'),
      },
      order: { purchaseDate: 'ASC', sequence: 'ASC' },
    });
  });

  it('첫 매수분만으로 충분하면 첫 행만 일부 매도한다', async () => {
    const first = row('2026-11-01', 1, '5');
    const second = row('2026-11-03', 1, '4');
    purchaseDateBalanceRepository.find.mockResolvedValue([first, second]);
    // 1) 같은 매도 행 없음 2) 같은 매수일의 마지막 sequence = 1
    purchaseDateBalanceRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(first);

    const result = await service.bulkSellBalance({ id: 1 }, input('2'));

    expect(first.amount).toBe('3');
    expect(second.amount).toBe('4');
    expect(result).toEqual([
      expect.objectContaining({
        purchaseDate: '2026-11-01',
        sequence: 2,
        amount: '2',
        saleDate: '2026-11-08',
        securityCompany: SecurityCompany.KIWOOM,
      }),
    ]);
  });

  it('여러 매수분에 걸치면 앞 행은 전량, 마지막 행은 일부 매도한다', async () => {
    const first = row('2026-11-01', 1, '5');
    const second = row('2026-11-03', 2, '4');
    const third = row('2026-11-05', 1, '10');
    purchaseDateBalanceRepository.find.mockResolvedValue([
      first,
      second,
      third,
    ]);
    // 첫 행: 같은 매도 행 없음 / 둘째 행: 같은 매도 행 없음, 마지막 sequence = 2
    purchaseDateBalanceRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(second);

    const result = await service.bulkSellBalance({ id: 1 }, input('7'));

    expect(result).toHaveLength(2);
    // 첫 행 전량: saleDate만 저장
    expect(result[0]).toMatchObject({
      purchaseDate: '2026-11-01',
      sequence: 1,
      amount: '5',
      saleDate: '2026-11-08',
    });
    // 둘째 행 일부: 2주 매도 새 행, 원래 행은 2주 남음
    expect(second.amount).toBe('2');
    expect(second.saleDate).toBeNull();
    expect(result[1]).toMatchObject({
      purchaseDate: '2026-11-03',
      sequence: 3,
      amount: '2',
      saleDate: '2026-11-08',
    });
    // 셋째 행은 건드리지 않음
    expect(third.amount).toBe('10');
    expect(third.saleDate).toBeNull();
  });

  it('보유 합계와 같으면 모두 전량 매도한다', async () => {
    const first = row('2026-11-01', 1, '5');
    const second = row('2026-11-03', 1, '4');
    purchaseDateBalanceRepository.find.mockResolvedValue([first, second]);

    const result = await service.bulkSellBalance({ id: 1 }, input('9'));

    expect(result.map((r) => [r.amount, r.saleDate])).toEqual([
      ['5', '2026-11-08'],
      ['4', '2026-11-08'],
    ]);
    expect(purchaseDateBalanceRepository.create).not.toHaveBeenCalled();
  });

  it('같은 매도 행이 있으면 거기에 합치고 미매도 행은 삭제한다', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([
      row('2026-11-01', 1, '5'),
    ]);
    purchaseDateBalanceRepository.findOne.mockResolvedValueOnce({
      ...row('2026-11-01', 2, '3'),
      saleDate: '2026-11-08',
    });

    const result = await service.bulkSellBalance({ id: 1 }, input('5'));

    expect(purchaseDateBalanceRepository.delete).toHaveBeenCalledWith({
      userId: 1,
      securityId: '005930',
      purchaseDate: '2026-11-01',
      sequence: 1,
    });
    expect(result).toEqual([expect.objectContaining({ sequence: 2, amount: '8' })]);
  });

  it('보유 합계보다 많으면 400이고 아무것도 저장하지 않는다', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([
      row('2026-11-01', 1, '5'),
      row('2026-11-03', 1, '4'),
    ]);

    await expect(
      service.bulkSellBalance({ id: 1 }, input('10')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(purchaseDateBalanceRepository.save).not.toHaveBeenCalled();
    expect(purchaseDateBalanceRepository.delete).not.toHaveBeenCalled();
  });

  it('대상 매수분이 없으면 400', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([]);

    await expect(
      service.bulkSellBalance({ id: 1 }, input('1')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('종목이 없으면 404', async () => {
    securityRepository.findOneBy.mockResolvedValue(null);

    await expect(
      service.bulkSellBalance({ id: 1 }, input('1')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(purchaseDateBalanceRepository.find).not.toHaveBeenCalled();
  });

  it('USD 종목은 소수 6자리 수량으로 나눠 매도한다', async () => {
    securityRepository.findOneBy.mockResolvedValue({
      id: '005930',
      currency: Currency.USD,
    });
    const first = row('2026-11-01', 1, '0.300000');
    const second = row('2026-11-03', 1, '1.000000');
    purchaseDateBalanceRepository.find.mockResolvedValue([first, second]);
    purchaseDateBalanceRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(second);

    const result = await service.bulkSellBalance(
      { id: 1 },
      input('0.5000009'),
    );

    expect(result[0]).toMatchObject({ amount: '0.300000', sequence: 1 });
    expect(result[1]).toMatchObject({ amount: '0.200000', sequence: 2 });
    expect(second.amount).toBe('0.800000');
  });
});
