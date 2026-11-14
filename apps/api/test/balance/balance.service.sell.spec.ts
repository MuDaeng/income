import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull } from 'typeorm';
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

// 단위 테스트에서는 트랜잭션 컨텍스트 없이 메서드만 실행
vi.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

const KEY = { userId: 1, securityId: '005930', purchaseDate: '2026-11-05' };
const unsold = (amount: string) => ({
  ...KEY,
  sequence: 1,
  securityCompany: 'KIWOOM',
  amount,
  price: '70000.000000',
  saleDate: null,
});
const input = (amount: string) => ({
  securityId: '005930',
  purchaseDate: '2026-11-05',
  sequence: 1,
  amount,
  saleDate: '2026-11-08',
});

describe('BalanceService.sellBalance', () => {
  const purchaseDateBalanceRepository = {
    findOne: vi.fn(),
    save: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  };
  const userRepository = { findOne: vi.fn() };
  const securityRepository = { findOneBy: vi.fn() };
  let service: BalanceService;

  /** findOne 호출 순서: 1) 미매도 대상 2) 같은 매도일 행 3) (새 행일 때) 마지막 sequence */
  const givenRows = (
    source: object | null,
    sold: object | null,
    last?: object | null,
  ) => {
    purchaseDateBalanceRepository.findOne
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(sold)
      .mockResolvedValueOnce(last ?? null);
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    userRepository.findOne.mockResolvedValue({ id: 1 });
    securityRepository.findOneBy.mockResolvedValue({
      id: '005930',
      currency: Currency.KRW,
    });
    purchaseDateBalanceRepository.save.mockImplementation((row: object) =>
      Promise.resolve(row),
    );
    purchaseDateBalanceRepository.create.mockImplementation((row: object) => row);

    const moduleRef = await Test.createTestingModule({
      providers: [
        BalanceService,
        {
          provide: getRepositoryToken(PurchaseDateBalance),
          useValue: purchaseDateBalanceRepository,
        },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Security), useValue: securityRepository },
        { provide: SecurityRefreshService, useValue: {} },
        { provide: getRepositoryToken(UserBalance), useValue: {} },
        { provide: getRepositoryToken(DailySecurity), useValue: {} },
        { provide: getRepositoryToken(DailyExchangeRate), useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(BalanceService);
  });

  it('미매도 대상은 sequence와 saleDate IS NULL로, 같은 매도일 행은 매수가·구매 환율·증권사까지 같은 것으로 찾는다', async () => {
    givenRows(unsold('10.000000'), null);

    await service.sellBalance({ id: 1 }, input('10'));

    expect(purchaseDateBalanceRepository.findOne).toHaveBeenNthCalledWith(1, {
      where: { ...KEY, sequence: 1, saleDate: IsNull() },
    });
    // 미매도 행의 환율이 null이면 환율 IS NULL인 행만
    expect(purchaseDateBalanceRepository.findOne).toHaveBeenNthCalledWith(2, {
      where: {
        ...KEY,
        saleDate: '2026-11-08',
        price: '70000.000000',
        exchangeRate: IsNull(),
        securityCompany: 'KIWOOM',
      },
    });
  });

  it('구매 환율이 있는 매수분: 같은 환율의 매도 행만 찾고, 새 매도 행에 환율을 복사한다', async () => {
    securityRepository.findOneBy.mockResolvedValue({
      id: '005930',
      currency: Currency.USD,
    });
    givenRows(
      { ...unsold('10.000000'), exchangeRate: '1400.500000' },
      null,
      { ...KEY, sequence: 1 },
    );

    const result = await service.sellBalance({ id: 1 }, input('3'));

    expect(purchaseDateBalanceRepository.findOne).toHaveBeenNthCalledWith(2, {
      where: {
        ...KEY,
        saleDate: '2026-11-08',
        price: '70000.000000',
        exchangeRate: '1400.500000',
        securityCompany: 'KIWOOM',
      },
    });
    expect(result).toMatchObject({
      sequence: 2,
      amount: '3.000000',
      saleDate: '2026-11-08',
      exchangeRate: '1400.500000',
    });
  });

  it('전량, 같은 매도일 행 없음 → 미매도 행에 saleDate만 저장', async () => {
    givenRows(unsold('10.000000'), null);

    const result = await service.sellBalance({ id: 1 }, input('10'));

    expect(result).toMatchObject({
      sequence: 1,
      amount: '10.000000',
      saleDate: '2026-11-08',
    });
    expect(purchaseDateBalanceRepository.save).toHaveBeenCalledTimes(1);
    expect(purchaseDateBalanceRepository.delete).not.toHaveBeenCalled();
  });

  it('전량, 같은 매도일 행 있음 → 그 행에 합치고 미매도 행 삭제', async () => {
    givenRows(unsold('7.000000'), {
      ...KEY,
      sequence: 2,
      amount: '3.000000',
      price: '70000.000000',
      saleDate: '2026-11-08',
    });

    const result = await service.sellBalance({ id: 1 }, input('7'));

    expect(result).toMatchObject({ sequence: 2, amount: '10' });
    expect(purchaseDateBalanceRepository.delete).toHaveBeenCalledWith({
      ...KEY,
      sequence: 1,
    });
  });

  it('일부, 같은 매도일 행 없음 → 미매도 행 감소 + 새 행(sequence max + 1, 매수가 유지)', async () => {
    givenRows(unsold('10.000000'), null, { ...KEY, sequence: 4 });

    const result = await service.sellBalance({ id: 1 }, input('3'));

    expect(purchaseDateBalanceRepository.save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sequence: 1, amount: '7', saleDate: null }),
    );
    // 새 매도 행은 원래 매수분의 증권사를 가진다
    expect(result).toEqual({
      ...KEY,
      sequence: 5,
      securityCompany: 'KIWOOM',
      amount: '3',
      price: '70000.000000',
      saleDate: '2026-11-08',
    });
  });

  it('일부, 같은 매도일 행 있음 → 미매도 행 감소 + 그 행 증가', async () => {
    givenRows(unsold('10.000000'), {
      ...KEY,
      sequence: 2,
      amount: '3.000000',
      price: '70000.000000',
      saleDate: '2026-11-08',
    });

    const result = await service.sellBalance({ id: 1 }, input('4'));

    expect(purchaseDateBalanceRepository.save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sequence: 1, amount: '6' }),
    );
    expect(result).toMatchObject({ sequence: 2, amount: '7' });
    expect(purchaseDateBalanceRepository.create).not.toHaveBeenCalled();
  });

  it('USD 종목은 소수 6자리로 버려서 계산한다', async () => {
    securityRepository.findOneBy.mockResolvedValue({
      id: '005930',
      currency: Currency.USD,
    });
    givenRows(unsold('1.500000'), null, { ...KEY, sequence: 1 });

    const result = await service.sellBalance({ id: 1 }, input('0.12345678'));

    expect(purchaseDateBalanceRepository.save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ amount: '1.376544' }),
    );
    expect(result).toMatchObject({ sequence: 2, amount: '0.123456' });
  });

  it('보유 수량보다 많으면 400, 아무것도 저장하지 않음', async () => {
    givenRows(unsold('10.000000'), null);

    await expect(service.sellBalance({ id: 1 }, input('11'))).rejects.toThrow(
      BadRequestException,
    );
    expect(purchaseDateBalanceRepository.save).not.toHaveBeenCalled();
  });

  it('미매도 대상이 없으면 404', async () => {
    givenRows(null, null);

    await expect(service.sellBalance({ id: 1 }, input('1'))).rejects.toThrow(
      NotFoundException,
    );
  });
});
