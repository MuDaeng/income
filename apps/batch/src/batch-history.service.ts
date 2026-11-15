import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BatchHistory, BatchStatus } from '@app/common';

/** result 컬럼에 남길 최대 길이 */
export const BATCH_RESULT_MAX_LENGTH = 10_000;

/**
 * 배치 실행 이력 기록. 이력 저장이 실패해도 잡은 계속돼야 하므로 예외를 던지지 않고 로그만 남긴다
 * (start가 실패하면 null을 돌려주고, finish는 null이면 아무것도 하지 않는다).
 */
@Injectable()
export class BatchHistoryService {
  private readonly logger = new Logger(BatchHistoryService.name);

  constructor(
    @InjectRepository(BatchHistory)
    private readonly batchHistoryRepository: Repository<BatchHistory>,
  ) {}

  async start(name: string): Promise<BatchHistory | null> {
    try {
      return await this.batchHistoryRepository.save(
        this.batchHistoryRepository.create({
          name,
          status: BatchStatus.RUNNING,
          startedAt: new Date(),
          finishedAt: null,
          durationMs: null,
          result: null,
        }),
      );
    } catch (error) {
      this.logger.error(`[${name}] 실행 이력 저장 실패: ${messageOf(error)}`);
      return null;
    }
  }

  async finish(
    history: BatchHistory | null,
    status: BatchStatus.SUCCESS | BatchStatus.FAILED,
    result: string | null,
  ): Promise<void> {
    if (!history) {
      return;
    }
    const finishedAt = new Date();
    history.status = status;
    history.finishedAt = finishedAt;
    history.durationMs = finishedAt.getTime() - history.startedAt.getTime();
    history.result = result?.slice(0, BATCH_RESULT_MAX_LENGTH) ?? null;
    try {
      await this.batchHistoryRepository.save(history);
    } catch (error) {
      this.logger.error(
        `[${history.name}] 실행 이력 저장 실패: ${messageOf(error)}`,
      );
    }
  }
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
