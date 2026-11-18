import { In, type Repository } from 'typeorm';
import {
  type BatchHistory,
  BatchStatus,
  SearchType,
  type Security,
  type SecuritySearch,
} from '@app/common';
import { AdminService } from '../../../src/admin/restapi/admin.service.js';

describe('AdminService.getBatchHistories', () => {
  const find = vi.fn();
  const service = new AdminService(
    { find } as unknown as Repository<BatchHistory>,
    {} as Repository<SecuritySearch>,
    {} as Repository<Security>,
  );

  beforeEach(() => {
    find.mockReset();
    find.mockResolvedValue([]);
  });

  it('필터 없이 시작 시각 최신순으로 limit건 조회한다', async () => {
    await service.getBatchHistories({ limit: 20 });

    expect(find).toHaveBeenCalledWith({
      where: {},
      order: { startedAt: 'DESC', id: 'DESC' },
      take: 20,
    });
  });

  it('잡 이름·상태를 주면 그 조건으로 조회한다', async () => {
    await service.getBatchHistories({
      name: 'us-daily-prices',
      status: BatchStatus.FAILED,
      limit: 5,
    });

    expect(find).toHaveBeenCalledWith({
      where: { name: 'us-daily-prices', status: BatchStatus.FAILED },
      order: { startedAt: 'DESC', id: 'DESC' },
      take: 5,
    });
  });
});

describe('AdminService.getPriceSearches', () => {
  const findSearches = vi.fn();
  const findSecurities = vi.fn();
  const service = new AdminService(
    {} as Repository<BatchHistory>,
    { find: findSearches } as unknown as Repository<SecuritySearch>,
    { find: findSecurities } as unknown as Repository<Security>,
  );
  const createdAt = new Date('2026-11-01T00:00:00Z');
  const updatedAt = new Date('2026-11-17T07:00:00Z');

  beforeEach(() => {
    findSearches.mockReset();
    findSecurities.mockReset();
  });

  it('PRICE 행을 최근 조회순으로 읽고 종목명을 붙여 정해진 키 순서로 돌려준다', async () => {
    findSearches.mockResolvedValue([
      { id: 'KR7005930003', type: SearchType.PRICE, lastSearchDate: '2026-11-17', fromDate: null, createdAt, updatedAt },
      { id: 'KR7000000000', type: SearchType.PRICE, lastSearchDate: '2026-11-16', fromDate: null, createdAt, updatedAt },
    ]);
    findSecurities.mockResolvedValue([{ id: 'KR7005930003', name: '삼성전자' }]);

    const result = await service.getPriceSearches();

    expect(findSearches).toHaveBeenCalledWith({
      where: { type: SearchType.PRICE },
      order: { lastSearchDate: 'DESC', id: 'ASC' },
    });
    expect(findSecurities).toHaveBeenCalledWith({
      select: { id: true, name: true },
      where: { id: In(['KR7005930003', 'KR7000000000']) },
    });
    expect(result).toEqual([
      { securityId: 'KR7005930003', name: '삼성전자', lastSearchDate: '2026-11-17', createdAt, updatedAt },
      { securityId: 'KR7000000000', name: null, lastSearchDate: '2026-11-16', createdAt, updatedAt },
    ]);
    expect(Object.keys(result[0])).toEqual([
      'securityId',
      'name',
      'lastSearchDate',
      'createdAt',
      'updatedAt',
    ]);
  });

  it('PRICE 행이 없으면 종목을 조회하지 않고 빈 배열', async () => {
    findSearches.mockResolvedValue([]);

    await expect(service.getPriceSearches()).resolves.toEqual([]);
    expect(findSecurities).not.toHaveBeenCalled();
  });
});
