import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
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
}
