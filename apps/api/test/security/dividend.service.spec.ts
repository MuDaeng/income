import {
  Currency,
  type Dividend,
  DividendType,
  type Security,
} from '@app/common';
import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { DividendService } from '../../src/security/dividend.service.js';
import type { SecurityRefreshService } from '../../src/security/security-refresh.service.js';

describe('DividendService', () => {
  const dividendFind = vi.fn();
  const findOneBy = vi.fn();
  const refresh = vi.fn();
  let service: DividendService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new DividendService(
      { find: dividendFind } as unknown as Repository<Dividend>,
      { findOneBy } as unknown as Repository<Security>,
      { refresh } as unknown as SecurityRefreshService,
    );
  });

  it('현금배당을 지급월별로 합산해 월 오름차순으로 돌려준다', async () => {
    const security = { id: 'US1', symbol: 'O', name: '리얼티인컴', currency: Currency.USD };
    findOneBy.mockResolvedValue(security);
    dividendFind.mockResolvedValue([
      { id: 'US1', paymentDate: '2026-01-15', amount: '0.263000' },
      { id: 'US1', paymentDate: '2026-01-30', amount: '0.100000' },
      { id: 'US1', paymentDate: '2026-02-14', amount: '0.264000' },
    ]);

    const result = await service.getMonthlyDividends({ securityId: 'US1' });

    expect(refresh).toHaveBeenCalledWith(security);
    expect(dividendFind).toHaveBeenCalledWith({
      where: { id: 'US1', type: DividendType.MONEY },
      order: { paymentDate: 'ASC' },
    });
    expect(result).toEqual({
      security,
      months: [
        { month: '2026-01', amount: '0.363000', count: 2 },
        { month: '2026-02', amount: '0.264000', count: 1 },
      ],
    });
  });

  it('KRW 종목은 정수로 버린다', async () => {
    findOneBy.mockResolvedValue({
      id: 'KR1',
      symbol: '1',
      name: 'n',
      currency: Currency.KRW,
    });
    dividendFind.mockResolvedValue([
      { id: 'KR1', paymentDate: '2026-03-31', amount: '361.900000' },
    ]);

    const result = await service.getMonthlyDividends({ securityId: 'KR1' });

    expect(result.months).toEqual([{ month: '2026-03', amount: '361', count: 1 }]);
  });

  it('종목이 없으면 404', async () => {
    findOneBy.mockResolvedValue(null);

    await expect(
      service.getMonthlyDividends({ securityId: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(dividendFind).not.toHaveBeenCalled();
  });
});

