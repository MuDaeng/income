import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In } from 'typeorm';
import {
  PurchaseDateBalance,
  SecurityCompany,
  User,
  UserBalance,
} from '@app/common';
import { PurchaseWriter } from '../../src/balance/purchase.writer.js';

describe('PurchaseWriter.removeByCompany', () => {
  const purchaseDateBalanceRepository = { find: vi.fn(), delete: vi.fn() };
  const userBalanceRepository = { delete: vi.fn() };
  let writer: PurchaseWriter;

  beforeEach(async () => {
    vi.resetAllMocks();
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

  it('그 증권사 행을 지우고, 남은 매수분이 없는 종목의 UserBalance만 지운다', async () => {
    purchaseDateBalanceRepository.find
      // 1) 지울 TOSS 행의 종목
      .mockResolvedValueOnce([
        { securityId: 'A' },
        { securityId: 'A' },
        { securityId: 'B' },
      ])
      // 2) 삭제 후 남은 행 (B는 다른 증권사 매수분이 있음)
      .mockResolvedValueOnce([{ securityId: 'B' }]);
    purchaseDateBalanceRepository.delete.mockResolvedValue({ affected: 3 });

    const deleted = await writer.removeByCompany(1, SecurityCompany.TOSS);

    expect(deleted).toBe(3);
    expect(purchaseDateBalanceRepository.delete).toHaveBeenCalledWith({
      userId: 1,
      securityCompany: SecurityCompany.TOSS,
    });
    expect(purchaseDateBalanceRepository.find).toHaveBeenLastCalledWith({
      where: { userId: 1, securityId: In(['A', 'B']) },
      select: { securityId: true },
    });
    expect(userBalanceRepository.delete).toHaveBeenCalledWith({
      userId: 1,
      securityId: In(['A']),
    });
  });

  it('지울 행이 없으면 아무것도 지우지 않는다', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([]);

    expect(await writer.removeByCompany(1, SecurityCompany.TOSS)).toBe(0);
    expect(purchaseDateBalanceRepository.delete).not.toHaveBeenCalled();
    expect(userBalanceRepository.delete).not.toHaveBeenCalled();
  });

  it('모든 종목에 다른 매수분이 남으면 UserBalance는 지우지 않는다', async () => {
    purchaseDateBalanceRepository.find
      .mockResolvedValueOnce([{ securityId: 'A' }])
      .mockResolvedValueOnce([{ securityId: 'A' }]);
    purchaseDateBalanceRepository.delete.mockResolvedValue({ affected: 1 });

    await writer.removeByCompany(1, SecurityCompany.TOSS);

    expect(userBalanceRepository.delete).not.toHaveBeenCalled();
  });
});
