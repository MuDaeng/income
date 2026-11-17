import type { Repository } from 'typeorm';
import { type BatchHistory, BatchStatus } from '@app/common';
import { AdminService } from '../../../src/admin/restapi/admin.service.js';

describe('AdminService.getBatchHistories', () => {
  const find = vi.fn();
  const service = new AdminService({
    find,
  } as unknown as Repository<BatchHistory>);

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
