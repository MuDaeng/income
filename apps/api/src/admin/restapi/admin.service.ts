import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  BatchHistory,
  ClientToken,
  SearchType,
  Security,
  SecuritySearch,
} from '@app/common';
import type { BatchHistoryItemDto } from './dto/batch-history.dto.js';
import type { BatchHistoryRequest } from './dto/batch-history.schema.js';
import type { ClientTokenItemDto } from './dto/client-token.dto.js';
import type { PriceSearchItemDto } from './dto/price-search.dto.js';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(BatchHistory)
    private readonly batchHistoryRepository: Repository<BatchHistory>,
    @InjectRepository(SecuritySearch)
    private readonly securitySearchRepository: Repository<SecuritySearch>,
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    @InjectRepository(ClientToken)
    private readonly clientTokenRepository: Repository<ClientToken>,
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

  /** 종목별 일별 시세(PRICE) 조회 이력: lastSearchDate 최신순, 같으면 종목 id순 */
  async getPriceSearches(): Promise<PriceSearchItemDto[]> {
    const searches = await this.securitySearchRepository.find({
      where: { type: SearchType.PRICE },
      order: { lastSearchDate: 'DESC', id: 'ASC' },
    });
    if (searches.length === 0) {
      return [];
    }
    const securities = await this.securityRepository.find({
      select: { id: true, name: true },
      where: { id: In(searches.map((search) => search.id)) },
    });
    const names = new Map(securities.map(({ id, name }) => [id, name]));
    return searches.map((search) => ({
      securityId: search.id,
      name: names.get(search.id) ?? null,
      lastSearchDate: search.lastSearchDate,
      createdAt: search.createdAt,
      updatedAt: search.updatedAt,
    }));
  }

  /** 외부 API 토큰별 마지막 발급(저장) 시각, 최신순. 토큰 값은 읽지 않는다 */
  async getClientTokens(): Promise<ClientTokenItemDto[]> {
    const tokens = await this.clientTokenRepository.find({
      select: { clientType: true, updatedAt: true },
      order: { updatedAt: 'DESC', clientType: 'ASC' },
    });
    return tokens.map(({ clientType, updatedAt }) => ({
      clientType,
      updatedAt,
    }));
  }
}
