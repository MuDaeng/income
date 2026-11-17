import {
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminGuard } from './admin.guard.js';
import { AdminService } from './admin.service.js';
import { BatchHistoryItemDto } from './dto/batch-history.dto.js';
import {
  type BatchHistoryRequest,
  batchHistorySchema,
} from './dto/batch-history.schema.js';
import { DomesticDailyPriceImportDto } from './dto/domestic-daily-price-import.dto.js';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('batch-histories')
  @ApiOperation({
    summary: '배치 실행 이력 조회 (관리자): 시작 시각 최신순, 잡 이름·상태로 필터',
  })
  @ApiOkResponse({ type: [BatchHistoryItemDto] })
  getBatchHistories(
    @Query({ schema: batchHistorySchema }) query: BatchHistoryRequest,
  ): Promise<BatchHistoryItemDto[]> {
    return this.adminService.getBatchHistories(query);
  }

  /** 일회용: 한 번 실행하고 지운다 */
  @Post('domestic-daily-prices/import')
  @HttpCode(202)
  @ApiOperation({
    summary:
      '[일회용] 국내 주식·ETF 일별 시세 2020-01-01~오늘 전체 적재 (관리자, data.go.kr): 백그라운드로 시작하고 바로 응답, 진행 중이면 409',
  })
  @ApiAcceptedResponse({ type: DomesticDailyPriceImportDto })
  importDomesticDailyPrices(): DomesticDailyPriceImportDto {
    return this.adminService.importDomesticDailyPrices();
  }
}
