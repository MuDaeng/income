import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PurchaseDateBalance } from '@app/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/jwt.strategy.js';
import { BalanceService } from './balance.service.js';
import { DividendHistoryResponse } from './dividend-history.dto.js';
import {
  type DividendHistoryRequest,
  dividendHistorySchema,
} from './dividend-history.schema.js';
import { DividendHistoryService } from './dividend-history.service.js';
import { IntegratedBalanceResponse } from './integrated-balance.dto.js';
import {
  type RegisterBalanceRequest,
  registerBalanceSchema,
} from './register-balance.schema.js';
import {
  type SellBalanceRequest,
  sellBalanceSchema,
} from './sell-balance.schema.js';

@ApiTags('balance')
@Controller('balance')
export class BalanceController {
  constructor(
    private readonly balanceService: BalanceService,
    private readonly dividendHistoryService: DividendHistoryService,
  ) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '매수 잔고 등록: 종목·매수일 시세 검증 후 사용자 잔고와 매수일별 잔고 등록',
  })
  register(
    @CurrentUser() user: AuthUser,
    @Body({ schema: registerBalanceSchema }) body: RegisterBalanceRequest,
  ): Promise<PurchaseDateBalance> {
    return this.balanceService.registerBalance(user, body);
  }

  @Post('sale')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '매도 등록: 매수분(매수일·sequence)의 전량 또는 일부를 매도일로 매도 처리',
  })
  sell(
    @CurrentUser() user: AuthUser,
    @Body({ schema: sellBalanceSchema }) body: SellBalanceRequest,
  ): Promise<PurchaseDateBalance> {
    return this.balanceService.sellBalance(user, body);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '통합잔고 조회: 종목별 매입평균가·평가금액(원화/외화)·수익률과 한국/미국/전체 합계',
  })
  @ApiOkResponse({ type: IntegratedBalanceResponse })
  getIntegratedBalance(
    @CurrentUser() user: AuthUser,
  ): Promise<IntegratedBalanceResponse> {
    return this.balanceService.getIntegratedBalance(user);
  }

  @Get('dividends')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '배당금 내역 조회: 기준일 보유수량 × 주당배당금, USD는 지급일 환율로 원화 환산, 기간 총배당금과 월별 내역',
  })
  @ApiOkResponse({ type: DividendHistoryResponse })
  getDividendHistory(
    @CurrentUser() user: AuthUser,
    @Query({ schema: dividendHistorySchema }) query: DividendHistoryRequest,
  ): Promise<DividendHistoryResponse> {
    return this.dividendHistoryService.getDividendHistory(user, query);
  }
}
