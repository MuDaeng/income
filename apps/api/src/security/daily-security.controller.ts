import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PRICE_THROTTLE } from '../rate-limit.js';
import { DailyPriceResponse } from './daily-price.dto.js';
import {
  type DailyPriceRequest,
  dailyPriceSchema,
} from './daily-price.schema.js';
import { DailySecurityService } from './daily-security.service.js';

@ApiTags('daily-security')
@Controller('daily-securities')
export class DailySecurityController {
  constructor(private readonly dailySecurityService: DailySecurityService) {}

  @Get()
  // 로그인 없이 호출되고 종목마다 외부 API 갱신을 일으키므로 기본보다 낮은 한도
  @Throttle(PRICE_THROTTLE)
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
}
