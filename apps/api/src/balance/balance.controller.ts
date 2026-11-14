import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PurchaseDateBalance } from '@app/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/jwt.strategy.js';
import { BalanceService } from './balance.service.js';
import {
  type DeletePurchaseRequest,
  deletePurchaseSchema,
} from './delete-purchase.schema.js';
import { DividendHistoryResponse } from './dividend-history.dto.js';
import {
  type DividendHistoryRequest,
  dividendHistorySchema,
} from './dividend-history.schema.js';
import { DividendHistoryService } from './dividend-history.service.js';
import { MonthlyBalanceResponse } from './monthly-balance.dto.js';
import {
  type MonthlyBalanceRequest,
  monthlyBalanceSchema,
} from './monthly-balance.schema.js';
import { MonthlyBalanceService } from './monthly-balance.service.js';
import { PeriodReturnResponse } from './period-return.dto.js';
import {
  type PeriodReturnRequest,
  periodReturnSchema,
} from './period-return.schema.js';
import { PeriodReturnService } from './period-return.service.js';
import { PurchaseHistoryResponse } from './purchase-history.dto.js';
import {
  type PurchaseHistoryRequest,
  purchaseHistorySchema,
} from './purchase-history.schema.js';
import { IntegratedBalanceResponse } from './integrated-balance.dto.js';
import {
  type IntegratedBalanceRequest,
  integratedBalanceSchema,
} from './integrated-balance.schema.js';
import {
  type RegisterBalanceRequest,
  registerBalanceSchema,
} from './register-balance.schema.js';
import {
  type SellBalanceRequest,
  sellBalanceSchema,
} from './sell-balance.schema.js';
import {
  type UpdateExchangeRateRequest,
  updateExchangeRateSchema,
} from './update-exchange-rate.schema.js';

@ApiTags('balance')
@Controller('balance')
export class BalanceController {
  constructor(
    private readonly balanceService: BalanceService,
    private readonly dividendHistoryService: DividendHistoryService,
    private readonly periodReturnService: PeriodReturnService,
    private readonly monthlyBalanceService: MonthlyBalanceService,
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
      '통합잔고 조회: 종목별 매입평균가·평가금액(원화/외화)·수익률과 한국/미국/전체 합계 (securityCompany를 주면 그 증권사 매수분만, 없으면 전체)',
  })
  @ApiOkResponse({ type: IntegratedBalanceResponse })
  getIntegratedBalance(
    @CurrentUser() user: AuthUser,
    @Query({ schema: integratedBalanceSchema }) query: IntegratedBalanceRequest,
  ): Promise<IntegratedBalanceResponse> {
    return this.balanceService.getIntegratedBalance(user, query);
  }

  @Get('purchases')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '종목 매수 내역 조회: 매수일 최신순 수량·매수일·매도일·매수가·구매환율(USD)',
  })
  @ApiOkResponse({ type: PurchaseHistoryResponse })
  getPurchases(
    @CurrentUser() user: AuthUser,
    @Query({ schema: purchaseHistorySchema }) query: PurchaseHistoryRequest,
  ): Promise<PurchaseHistoryResponse> {
    return this.balanceService.getPurchases(user, query);
  }

  @Patch('purchases')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '매수분 구매 환율 수정: 종목·매수일·sequence로 매수분 하나의 환율 변경(USD 종목만), null이면 저장 환율 삭제',
  })
  updateExchangeRate(
    @CurrentUser() user: AuthUser,
    @Body({ schema: updateExchangeRateSchema }) body: UpdateExchangeRateRequest,
  ): Promise<PurchaseDateBalance> {
    return this.balanceService.updateExchangeRate(user, body);
  }

  @Delete('purchases')
  @HttpCode(204)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '매수 내역 삭제(오등록 정정): 종목·매수일·sequence로 매수분 하나 삭제, 남은 매수분이 없으면 보유 종목에서도 제거',
  })
  @ApiNoContentResponse()
  deletePurchase(
    @CurrentUser() user: AuthUser,
    @Query({ schema: deletePurchaseSchema }) query: DeletePurchaseRequest,
  ): Promise<void> {
    return this.balanceService.deletePurchase(user, query);
  }

  @Get('dividends')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '배당금 내역 조회: 기준일 보유수량 × 주당배당금, USD는 지급일 환율로 원화 환산, 기간 총배당금과 월별 내역 (securityCompany를 주면 그 증권사 보유분만)',
  })
  @ApiOkResponse({ type: DividendHistoryResponse })
  getDividendHistory(
    @CurrentUser() user: AuthUser,
    @Query({ schema: dividendHistorySchema }) query: DividendHistoryRequest,
  ): Promise<DividendHistoryResponse> {
    return this.dividendHistoryService.getDividendHistory(user, query);
  }

  @Get('returns')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '기간 총수익률 조회: 종료일 보유분 평가수익 + 기간 배당금, 원금 대비 수익금·수익률 (securityCompany를 주면 그 증권사만)',
  })
  @ApiOkResponse({ type: PeriodReturnResponse })
  getPeriodReturn(
    @CurrentUser() user: AuthUser,
    @Query({ schema: periodReturnSchema }) query: PeriodReturnRequest,
  ): Promise<PeriodReturnResponse> {
    return this.periodReturnService.getPeriodReturn(user, query);
  }

  @Get('monthly')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '월말별 원금·평가금액·평가금액+누적배당금 조회 (from~to 년월, 이번 달은 오늘 기준, 월별 합계 + 종목별, securityCompany를 주면 그 증권사만)',
  })
  @ApiOkResponse({ type: MonthlyBalanceResponse })
  getMonthlyBalance(
    @CurrentUser() user: AuthUser,
    @Query({ schema: monthlyBalanceSchema }) query: MonthlyBalanceRequest,
  ): Promise<MonthlyBalanceResponse> {
    return this.monthlyBalanceService.getMonthlyBalance(user, query);
  }
}
