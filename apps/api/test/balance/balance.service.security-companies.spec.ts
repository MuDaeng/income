import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
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
import { PurchaseWriter } from '../../src/balance/purchase.writer.js';
import { DailyPriceReader } from '../../src/security/daily-price.reader.js';
import { ExchangeRateReader } from '../../src/security/exchange-rate.reader.js';

describe('BalanceService.getSecurityCompanies', () => {
  const purchaseDateBalanceRepository = { find: vi.fn() };
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
        {
          provide: getRepositoryToken(PurchaseDateBalance),
          useValue: purchaseDateBalanceRepository,
        },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(Security), useValue: {} },
        { provide: SecurityRefresher, useValue: {} },
        { provide: getRepositoryToken(UserBalance), useValue: {} },
        { provide: getRepositoryToken(DailySecurity), useValue: {} },
        { provide: getRepositoryToken(DailyExchangeRate), useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(BalanceService);
  });

  it('로그인 사용자의 증권사 컬럼만 읽어 중복 없이 enum 순서로 돌려준다', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([
      { securityCompany: SecurityCompany.TOSS },
      { securityCompany: SecurityCompany.KIWOOM },
      { securityCompany: SecurityCompany.MIRAE_ASSET },
      { securityCompany: SecurityCompany.TOSS },
    ]);

    const result = await service.getSecurityCompanies({ id: 3 });

    expect(purchaseDateBalanceRepository.find).toHaveBeenCalledWith({
      where: { userId: 3 },
      select: { securityCompany: true },
    });
    expect(result).toEqual({
      securityCompanies: [
        SecurityCompany.MIRAE_ASSET,
        SecurityCompany.KIWOOM,
        SecurityCompany.TOSS,
      ],
    });
  });

  it('매수 기록이 없으면 빈 배열', async () => {
    purchaseDateBalanceRepository.find.mockResolvedValue([]);

    await expect(service.getSecurityCompanies({ id: 3 })).resolves.toEqual({
      securityCompanies: [],
    });
  });
});
