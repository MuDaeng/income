import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { DailyPriceResponse } from './daily-price.dto.js';
import {
  type DailyPriceRequest,
  dailyPriceSchema,
} from './daily-price.schema.js';
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

  @Get()
  @ApiOperation({
    summary:
      '종목 일별 시세 조회: ISIN 코드(완전일치)로 일별 시가·종가·고가·저가 (기간 생략 시 전체)',
  })
  @ApiOkResponse({ type: DailyPriceResponse })
  getDailyPrices(
    @Query({ schema: dailyPriceSchema }) query: DailyPriceRequest,
  ): Promise<DailyPriceResponse> {
    return this.dailySecurityService.getDailyPrices(query);
  }

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

  @Post('import/etf')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'ETF 일별 시세 가져오기: data.go.kr 증권상품시세로 국내 ETF 일봉을 daily_security에 저장 (기간 생략 시 최근 2년)',
  })
  importEtf(
    @Body({ schema: importDailySecuritiesSchema })
    body: ImportDailySecuritiesRequest,
  ): Promise<ImportDailySecuritiesResult> {
    return this.dailySecurityService.importEtfFromDataGoKr(body);
  }

  @Post('import/us')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '미국 일별 시세 가져오기: Massive로 미국 주식 일봉을 daily_security에 저장 (기간 생략 시 최근 2년)',
  })
  importUs(
    @Body({ schema: importDailySecuritiesSchema })
    body: ImportDailySecuritiesRequest,
  ): Promise<ImportDailySecuritiesResult> {
    return this.dailySecurityService.importUsFromMassive(body);
  }
}
