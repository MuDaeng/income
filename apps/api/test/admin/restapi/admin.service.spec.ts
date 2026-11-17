import { ConflictException, Logger } from '@nestjs/common';
import type { Repository } from 'typeorm';
import {
  type BatchHistory,
  BatchStatus,
  type DomesticDailyPriceFetcher,
} from '@app/common';
import { AdminService } from '../../../src/admin/restapi/admin.service.js';

describe('AdminService.getBatchHistories', () => {
  const find = vi.fn();
  const service = new AdminService(
    { find } as unknown as Repository<BatchHistory>,
    {} as DomesticDailyPriceFetcher,
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

describe('AdminService.importDomesticDailyPrices', () => {
  const importFromDataGoKr = vi.fn<DomesticDailyPriceFetcher['importFromDataGoKr']>();
  let service: AdminService;
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T15:30:00Z')); // 한국 11-17 00:30
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    service = new AdminService(
      {} as Repository<BatchHistory>,
      { importFromDataGoKr } as unknown as DomesticDailyPriceFetcher,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('2020-01-01 ~ 한국 시간 오늘을 백그라운드로 시작하고 기간을 바로 돌려준다', () => {
    importFromDataGoKr.mockReturnValue(new Promise(() => undefined));

    expect(service.importDomesticDailyPrices()).toEqual({
      from: '2020-01-01',
      to: '2026-11-17',
    });
    expect(importFromDataGoKr).toHaveBeenCalledWith({
      from: '2020-01-01',
      to: '2026-11-17',
    });
  });

  it('진행 중이면 409, 끝나면 다시 시작할 수 있다', async () => {
    let finish: () => void = () => undefined;
    importFromDataGoKr.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = () =>
          resolve({
            from: '2020-01-01',
            to: '2026-11-17',
            fetched: 0,
            saved: 0,
            skipped: 0,
            firstDate: null,
            lastDate: null,
          });
      }),
    );
    importFromDataGoKr.mockReturnValueOnce(new Promise(() => undefined));

    service.importDomesticDailyPrices();
    expect(() => service.importDomesticDailyPrices()).toThrow(ConflictException);

    finish();
    await vi.waitFor(() =>
      expect(() => service.importDomesticDailyPrices()).not.toThrow(),
    );
    expect(importFromDataGoKr).toHaveBeenCalledTimes(2);
  });

  it('실패하면 로그를 남기고 다시 시작할 수 있다', async () => {
    importFromDataGoKr.mockRejectedValueOnce(new Error('data.go.kr 502'));
    importFromDataGoKr.mockReturnValueOnce(new Promise(() => undefined));

    service.importDomesticDailyPrices();

    await vi.waitFor(() =>
      expect(errorLog).toHaveBeenCalledWith(
        expect.stringContaining('data.go.kr 502'),
        expect.any(String),
      ),
    );
    await vi.waitFor(() =>
      expect(() => service.importDomesticDailyPrices()).not.toThrow(),
    );
  });
});
