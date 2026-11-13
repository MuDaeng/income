import { NotFoundException } from '@nestjs/common';
import { Between, LessThanOrEqual } from 'typeorm';
import type { Repository } from 'typeorm';
import { Currency, DailySecurity, Security } from '@app/common';
import type { DataGoKrClient } from '@app/core';
import { DailySecurityService } from '../../src/security/daily-security.service.js';
import type { SecurityRefreshService } from '../../src/security/security-refresh.service.js';

const AAPL = {
  id: 'US0378331005',
  symbol: 'AAPL',
  name: '애플',
  shortenedName: '애플',
  currency: Currency.USD,
};

describe('DailySecurityService.getDailyPrices', () => {
  const findOneBy = vi.fn();
  const dailyFind = vi.fn();
  const refresh = vi.fn();
  let service: DailySecurityService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new DailySecurityService(
      { find: dailyFind } as unknown as Repository<DailySecurity>,
      { findOneBy } as unknown as Repository<Security>,
      {} as DataGoKrClient,
      { refresh } as unknown as SecurityRefreshService,
    );
  });

  it('ISIN이 일치하는 종목의 시세를 통화별로 버려 날짜순으로 돌려준다', async () => {
    findOneBy.mockResolvedValue(AAPL);
    dailyFind.mockResolvedValue([
      {
        id: AAPL.id,
        date: '2026-11-05',
        openingPrice: '340.120000',
        closingPrice: '341.500000',
        highestPrice: '342.990000',
        lowestPrice: '339.010000',
      },
    ]);

    const result = await service.getDailyPrices({
      securityId: AAPL.id,
      from: '2026-11-01',
      to: '2026-11-06',
    });

    expect(findOneBy).toHaveBeenCalledWith({ id: AAPL.id });
    // 읽기 전에 그 종목을 온라인으로 갱신한다
    expect(refresh).toHaveBeenCalledWith(AAPL);
    expect(refresh.mock.invocationCallOrder[0]).toBeLessThan(
      dailyFind.mock.invocationCallOrder[0],
    );
    expect(dailyFind).toHaveBeenCalledWith({
      where: { id: AAPL.id, date: Between('2026-11-01', '2026-11-06') },
      order: { date: 'ASC' },
    });
    expect(result).toEqual({
      security: { id: AAPL.id, symbol: 'AAPL', name: '애플', currency: Currency.USD },
      from: '2026-11-01',
      to: '2026-11-06',
      prices: [
        {
          date: '2026-11-05',
          openingPrice: '340.120000',
          closingPrice: '341.500000',
          highestPrice: '342.990000',
          lowestPrice: '339.010000',
        },
      ],
    });
  });

  it('KRW 종목 가격은 정수로 버리고, 기간이 한쪽만 있으면 그쪽만 제한한다', async () => {
    findOneBy.mockResolvedValue({
      id: 'KR7476800008',
      symbol: '476800',
      name: '리츠',
      currency: Currency.KRW,
    });
    dailyFind.mockResolvedValue([
      {
        id: 'KR7476800008',
        date: '2026-11-05',
        openingPrice: '3930.000000',
        closingPrice: '3920.000000',
        highestPrice: '3945.500000',
        lowestPrice: '3910.000000',
      },
    ]);

    const result = await service.getDailyPrices({
      securityId: 'KR7476800008',
      to: '2026-11-05',
    });

    expect(dailyFind.mock.calls[0][0].where.date).toEqual(LessThanOrEqual('2026-11-05'));
    expect(result.prices[0]).toEqual({
      date: '2026-11-05',
      openingPrice: '3930',
      closingPrice: '3920',
      highestPrice: '3945',
      lowestPrice: '3910',
    });
    expect(result.from).toBeNull();
  });

  it('기간이 없으면 날짜 조건 없이 조회한다', async () => {
    findOneBy.mockResolvedValue(AAPL);
    dailyFind.mockResolvedValue([]);

    await service.getDailyPrices({ securityId: AAPL.id });

    expect(dailyFind.mock.calls[0][0].where).toEqual({ id: AAPL.id });
  });

  it('ISIN이 일치하는 종목이 없으면 404', async () => {
    findOneBy.mockResolvedValue(null);

    await expect(service.getDailyPrices({ securityId: 'AAPL' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(dailyFind).not.toHaveBeenCalled();
  });
});
