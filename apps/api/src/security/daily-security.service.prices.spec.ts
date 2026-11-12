import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Between, LessThanOrEqual } from 'typeorm';
import type { Repository } from 'typeorm';
import { Currency, DailySecurity, Security } from '@app/common';
import type { DataGoKrClient } from '../clients/data-go-kr/data-go-kr.client.js';
import type { MassiveClient } from '../clients/massive/massive.client.js';
import { DailySecurityService } from './daily-security.service.js';

const AAPL = {
  id: 'US0378331005',
  symbol: 'AAPL',
  name: '애플',
  shortenedName: '애플',
  currency: Currency.USD,
};

describe('DailySecurityService.getDailyPrices', () => {
  const securityFind = vi.fn();
  const dailyFind = vi.fn();
  let service: DailySecurityService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new DailySecurityService(
      { find: dailyFind } as unknown as Repository<DailySecurity>,
      { find: securityFind } as unknown as Repository<Security>,
      {} as DataGoKrClient,
      {} as MassiveClient,
    );
  });

  it('id·symbol·종목명 중 정확히 일치하는 종목 하나의 시세를 통화별로 버려 날짜순으로 돌려준다', async () => {
    securityFind.mockResolvedValue([AAPL]);
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
      keyword: 'AAPL',
      from: '2026-11-01',
      to: '2026-11-06',
    });

    expect(securityFind).toHaveBeenCalledWith({
      where: [{ id: 'AAPL' }, { symbol: 'AAPL' }, { name: 'AAPL' }],
      order: { id: 'ASC' },
    });
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
    securityFind.mockResolvedValue([
      { id: 'KR7476800008', symbol: '476800', name: '리츠', currency: Currency.KRW },
    ]);
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

    const result = await service.getDailyPrices({ keyword: '476800', to: '2026-11-05' });

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
    securityFind.mockResolvedValue([AAPL]);
    dailyFind.mockResolvedValue([]);

    await service.getDailyPrices({ keyword: 'AAPL' });

    expect(dailyFind.mock.calls[0][0].where).toEqual({ id: AAPL.id });
  });

  it('일치하는 종목이 없으면 404', async () => {
    securityFind.mockResolvedValue([]);

    await expect(service.getDailyPrices({ keyword: '없는종목' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(dailyFind).not.toHaveBeenCalled();
  });

  it('여러 종목이 일치하면 후보 목록과 함께 400', async () => {
    securityFind.mockResolvedValue([
      { id: 'A', symbol: 'X', name: '같은이름', currency: Currency.KRW },
      { id: 'B', symbol: 'Y', name: '같은이름', currency: Currency.USD },
    ]);

    const error = await service
      .getDailyPrices({ keyword: '같은이름' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      message: '여러 종목이 일치합니다. 후보의 id(ISIN)로 다시 조회하세요.',
      candidates: [
        { id: 'A', symbol: 'X', name: '같은이름', currency: Currency.KRW },
        { id: 'B', symbol: 'Y', name: '같은이름', currency: Currency.USD },
      ],
    });
    expect(dailyFind).not.toHaveBeenCalled();
  });
});
