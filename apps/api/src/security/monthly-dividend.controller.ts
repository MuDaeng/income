import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PRICE_THROTTLE } from '../rate-limit.js';
import { MonthlyDividendResponse } from './monthly-dividend.dto.js';
import {
  type MonthlyDividendRequest,
  monthlyDividendSchema,
} from './monthly-dividend.schema.js';
import { MonthlyDividendService } from './monthly-dividend.service.js';

@ApiTags('dividend')
@Controller('dividends')
export class MonthlyDividendController {
  constructor(private readonly monthlyDividendService: MonthlyDividendService) {}

  @Get()
  // 로그인 없이 호출되고 종목마다 외부 API 갱신을 일으키므로 기본보다 낮은 한도
  @Throttle(PRICE_THROTTLE)
  @ApiOperation({
    summary: '종목 월별 배당금 조회: ISIN 코드(완전일치)로 지급월별 1주당 현금배당금 합계',
  })
  @ApiOkResponse({ type: MonthlyDividendResponse })
  getMonthlyDividends(
    @Query({ schema: monthlyDividendSchema }) query: MonthlyDividendRequest,
  ): Promise<MonthlyDividendResponse> {
    return this.monthlyDividendService.getMonthlyDividends(query);
  }
}
