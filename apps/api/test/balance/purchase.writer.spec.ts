import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PurchaseDateBalance, User, UserBalance } from '@app/common';
import { PurchaseWriter } from '../../src/balance/purchase.writer.js';

describe('PurchaseWriter', () => {
  const purchaseDateBalanceRepository = {
    delete: vi.fn(),
    update: vi.fn(),
    existsBy: vi.fn(),
  };
  const userBalanceRepository = {
    delete: vi.fn(),
    existsBy: vi.fn(),
    save: vi.fn(),
    create: vi.fn(),
  };
  let writer: PurchaseWriter;

  beforeEach(async () => {
    vi.resetAllMocks();
    userBalanceRepository.create.mockImplementation((value: object) => value);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchaseWriter,
        {
          provide: getRepositoryToken(PurchaseDateBalance),
          useValue: purchaseDateBalanceRepository,
        },
        {
          provide: getRepositoryToken(UserBalance),
          useValue: userBalanceRepository,
        },
        { provide: getRepositoryToken(User), useValue: {} },
      ],
    }).compile();
    writer = moduleRef.get(PurchaseWriter);
  });

  describe('removeByAccount', () => {
    it('그 계좌의 매수분과 보유 종목을 모두 지우고 지운 행 수를 돌려준다', async () => {
      purchaseDateBalanceRepository.delete.mockResolvedValue({ affected: 3 });

      expect(await writer.removeByAccount(1, 2)).toBe(3);
      expect(purchaseDateBalanceRepository.delete).toHaveBeenCalledWith({
        userId: 1,
        accountId: 2,
      });
      expect(userBalanceRepository.delete).toHaveBeenCalledWith({
        userId: 1,
        accountId: 2,
      });
    });
  });

  describe('moveAccount', () => {
    const purchase = () =>
      ({
        userId: 1,
        accountId: 1,
        securityId: 'A',
        purchaseDate: '2026-11-01',
        sequence: 2,
      }) as PurchaseDateBalance;

    it('옮길 계좌의 UserBalance를 만들고 PK의 accountId를 update로 바꾼 뒤, 빈 원래 UserBalance를 지운다', async () => {
      userBalanceRepository.existsBy.mockResolvedValue(false);
      purchaseDateBalanceRepository.existsBy.mockResolvedValue(false);

      const moved = await writer.moveAccount(purchase(), 3);

      expect(moved.accountId).toBe(3);
      expect(userBalanceRepository.save).toHaveBeenCalledWith({
        userId: 1,
        accountId: 3,
        securityId: 'A',
      });
      expect(purchaseDateBalanceRepository.update).toHaveBeenCalledWith(
        {
          userId: 1,
          accountId: 1,
          securityId: 'A',
          purchaseDate: '2026-11-01',
          sequence: 2,
        },
        { accountId: 3 },
      );
      expect(userBalanceRepository.delete).toHaveBeenCalledWith({
        userId: 1,
        accountId: 1,
        securityId: 'A',
      });
    });

    it('원래 계좌에 매수분이 남으면 원래 UserBalance는 두고, 옮길 계좌에 이미 있으면 만들지 않는다', async () => {
      userBalanceRepository.existsBy.mockResolvedValue(true);
      purchaseDateBalanceRepository.existsBy.mockResolvedValue(true);

      await writer.moveAccount(purchase(), 3);

      expect(userBalanceRepository.save).not.toHaveBeenCalled();
      expect(userBalanceRepository.delete).not.toHaveBeenCalled();
    });

    it('같은 계좌면 아무것도 하지 않는다', async () => {
      await writer.moveAccount(purchase(), 1);

      expect(purchaseDateBalanceRepository.update).not.toHaveBeenCalled();
    });
  });
});
