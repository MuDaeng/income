import { Logger } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { BatchHistory, BatchStatus } from '@app/common';
import {
  BATCH_RESULT_MAX_LENGTH,
  BatchHistoryWriter,
} from '../../src/batch/batch-history.writer.js';

describe('BatchHistoryWriter', () => {
  const save = vi.fn();
  const create = vi.fn((value: Partial<BatchHistory>) => ({ ...value }));
  let service: BatchHistoryWriter;
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    create.mockImplementation((value: Partial<BatchHistory>) => ({ ...value }));
    errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    service = new BatchHistoryWriter({
      save,
      create,
    } as unknown as Repository<BatchHistory>);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('start는 RUNNING 행을 지금 시각으로 저장하고 돌려준다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-15T06:00:00Z'));
    save.mockResolvedValue({ id: 7 });

    const history = await service.start('us-daily-prices');

    expect(save).toHaveBeenCalledWith({
      name: 'us-daily-prices',
      status: BatchStatus.RUNNING,
      startedAt: new Date('2026-11-15T06:00:00Z'),
      finishedAt: null,
      durationMs: null,
      result: null,
    });
    expect(history?.id).toBe(7);
  });

  it('finish는 상태·종료 시각·소요 시간·결과를 채워 저장하고, 결과는 최대 길이로 자른다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-15T06:00:30Z'));
    const history = {
      id: 7,
      name: 'us-daily-prices',
      status: BatchStatus.RUNNING,
      startedAt: new Date('2026-11-15T06:00:00Z'),
    } as BatchHistory;

    await service.finish(
      history,
      BatchStatus.SUCCESS,
      'x'.repeat(BATCH_RESULT_MAX_LENGTH + 5),
    );

    expect(save).toHaveBeenCalledWith({
      id: 7,
      name: 'us-daily-prices',
      startedAt: new Date('2026-11-15T06:00:00Z'),
      status: BatchStatus.SUCCESS,
      finishedAt: new Date('2026-11-15T06:00:30Z'),
      durationMs: 30_000,
      result: 'x'.repeat(BATCH_RESULT_MAX_LENGTH),
    });
  });

  it('저장이 실패해도 예외를 던지지 않는다 (start는 null, finish는 null이면 건너뜀)', async () => {
    save.mockRejectedValue(new Error('DB down'));

    await expect(service.start('expired-tokens')).resolves.toBeNull();
    await expect(
      service.finish(
        { name: 'expired-tokens', startedAt: new Date() } as BatchHistory,
        BatchStatus.FAILED,
        'boom',
      ),
    ).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledTimes(2);

    save.mockClear();
    await service.finish(null, BatchStatus.SUCCESS, null);
    expect(save).not.toHaveBeenCalled();
  });
});
