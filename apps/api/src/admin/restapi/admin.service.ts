import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BatchHistory, DomesticDailyPriceFetcher } from '@app/common';
import type { BatchHistoryItemDto } from './dto/batch-history.dto.js';
import type { BatchHistoryRequest } from './dto/batch-history.schema.js';
import type { DomesticDailyPriceImportDto } from './dto/domestic-daily-price-import.dto.js';

/** 일회용 국내 시세 전체 적재의 시작일 (data.go.kr 일별 시세는 2020-01-02부터) */
export const DOMESTIC_DAILY_PRICE_IMPORT_FROM = '2020-01-01';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  /** 일회용 국내 시세 전체 적재가 진행 중인지 (pm2 프로세스 하나라 메모리로 충분) */
  private importingDomesticDailyPrices = false;

  constructor(
    @InjectRepository(BatchHistory)
    private readonly batchHistoryRepository: Repository<BatchHistory>,
    private readonly domesticDailyPriceFetcher: DomesticDailyPriceFetcher,
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

  /**
   * [일회용, 한 번 실행하고 지움] data.go.kr 국내 주식·ETF 일별 시세를 2020-01-01 ~ 오늘(한국 시간) 전부 받아 저장한다.
   * 수백 페이지라 오래 걸리므로 백그라운드로 시작만 하고 바로 돌려준다. 진행·결과는 로그로 확인. 진행 중이면 409
   */
  importDomesticDailyPrices(): DomesticDailyPriceImportDto {
    if (this.importingDomesticDailyPrices) {
      throw new ConflictException('국내 일별 시세 전체 적재가 이미 진행 중입니다.');
    }
    this.importingDomesticDailyPrices = true;
    const range = { from: DOMESTIC_DAILY_PRICE_IMPORT_FROM, to: todayInSeoul() };
    const startedAt = Date.now();
    this.logger.log(`국내 일별 시세 전체 적재 시작 ${range.from}~${range.to}`);
    void this.domesticDailyPriceFetcher
      .importFromDataGoKr(range)
      .then((result) =>
        this.logger.log(
          `국내 일별 시세 전체 적재 완료 ${Date.now() - startedAt}ms ${JSON.stringify(result)}`,
        ),
      )
      .catch((error: unknown) =>
        this.logger.error(
          `국내 일별 시세 전체 적재 실패 ${Date.now() - startedAt}ms: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
        ),
      )
      .finally(() => {
        this.importingDomesticDailyPrices = false;
      });
    return range;
  }
}

const todayInSeoul = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(
    new Date(),
  );
