import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type ImportDailySecuritiesResult,
  DailySecurityService,
} from './daily-security.service.js';
import {
  type ImportDailySecuritiesRequest,
  importDailySecuritiesSchema,
} from './import-daily-securities.schema.js';

@ApiTags('daily-security')
@Controller('daily-securities')
export class DailySecurityController {
  constructor(private readonly dailySecurityService: DailySecurityService) {}

  @Post('import')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '일별 시세 가져오기: data.go.kr 주식시세로 국내 주식 일봉을 daily_security에 저장 (기간 생략 시 최근 2년)',
  })
  import(
    @Body({ schema: importDailySecuritiesSchema })
    body: ImportDailySecuritiesRequest,
  ): Promise<ImportDailySecuritiesResult> {
    return this.dailySecurityService.importFromDataGoKr(body);
  }
}
