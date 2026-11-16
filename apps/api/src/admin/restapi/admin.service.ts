import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BatchHistory } from '@app/common';
import type { BatchHistoryItemDto } from './dto/batch-history.dto.js';
import type { BatchHistoryRequest } from './dto/batch-history.schema.js';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(BatchHistory)
    private readonly batchHistoryRepository: Repository<BatchHistory>,
  ) {}

  /** 배치 실행 이력, 시작 시각 최신순 limit건. name·status를 주면 그 조건으로 거른다 */
  getBatchHistories(
    input: BatchHistoryRequest,
  ): Promise<BatchHistoryItemDto[]> {
    const { name, status, limit } = input;
    return this.batchHistoryRepository.find({
      where: {
        ...(name ? { name } : {}),
        ...(status ? { status } : {}),
      },
      order: { startedAt: 'DESC', id: 'DESC' },
      take: limit,
    });
  }
}
