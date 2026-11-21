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
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PurchaseDateBalance } from '@app/common';
import { CurrentUser } from '../../auth/restapi/current-user.decorator.js';
import type { AuthUser } from '../../auth/restapi/jwt.strategy.js';
import { BalanceService } from './balance.service.js';
import {
  type BulkSellBalanceRequest,
  bulkSellBalanceSchema,
} from './dto/bulk-sell-balance.schema.js';
import { BulkRegisterBalanceTossResponse } from './dto/bulk-register-balance-toss.dto.js';
import {
  type BulkRegisterBalanceTossRequest,
  bulkRegisterBalanceTossSchema,
} from './dto/bulk-register-balance-toss.schema.js';
import {
  type DeletePurchaseRequest,
  deletePurchaseSchema,
} from './dto/delete-purchase.schema.js';
import { DividendHistoryResponse } from './dto/dividend-history.dto.js';
import {
  type DividendHistoryRequest,
  dividendHistorySchema,
} from './dto/dividend-history.schema.js';
import { DividendHistoryService } from './dividend-history.service.js';
import { DividendMetricsResponse } from './dto/dividend-metrics.dto.js';
import {
  type DividendMetricsRequest,
  dividendMetricsSchema,
} from './dto/dividend-metrics.schema.js';
import { DividendMetricsService } from './dividend-metrics.service.js';
import { MonthlyBalanceResponse } from './dto/monthly-balance.dto.js';
import {
  type MonthlyBalanceRequest,
  monthlyBalanceSchema,
} from './dto/monthly-balance.schema.js';
import { MonthlyBalanceService } from './monthly-balance.service.js';
import { PeriodReturnResponse } from './dto/period-return.dto.js';
import {
  type PeriodReturnRequest,
  periodReturnSchema,
} from './dto/period-return.schema.js';
import { PeriodReturnService } from './period-return.service.js';
import { PurchaseHistoryResponse } from './dto/purchase-history.dto.js';
import {
  type PurchaseHistoryRequest,
  purchaseHistorySchema,
} from './dto/purchase-history.schema.js';
import { IntegratedBalanceResponse } from './dto/integrated-balance.dto.js';
import {
  type IntegratedBalanceRequest,
  integratedBalanceSchema,
} from './dto/integrated-balance.schema.js';
import {
  type RegisterBalanceRequest,
  registerBalanceSchema,
} from './dto/register-balance.schema.js';
import {
  type SellBalanceRequest,
  sellBalanceSchema,
} from './dto/sell-balance.schema.js';
import {
  type UpdateExchangeRateRequest,
  updateExchangeRateSchema,
} from './dto/update-exchange-rate.schema.js';
import {
  type UpdatePurchaseAccountRequest,
  updatePurchaseAccountSchema,
} from './dto/update-purchase-account.schema.js';

@ApiTags('balance')
@Controller('balance')
export class BalanceController {
  constructor(
    private readonly balanceService: BalanceService,
    private readonly dividendHistoryService: DividendHistoryService,
    private readonly periodReturnService: PeriodReturnService,
    private readonly monthlyBalanceService: MonthlyBalanceService,
    private readonly dividendMetricsService: DividendMetricsService,
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

  @Post('sale/bulk')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '계좌별 일괄매도: 계좌(accountId, 없으면 그 증권사의 첫 계좌)의 미매도 매수분(매도일 이전 매수)을 매수일 최근 순으로 수량만큼 매도',
  })
  bulkSell(
    @CurrentUser() user: AuthUser,
    @Body({ schema: bulkSellBalanceSchema }) body: BulkSellBalanceRequest,
  ): Promise<PurchaseDateBalance[]> {
    return this.balanceService.bulkSellBalance(user, body);
  }

  @Post('toss')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Toss 거래내역으로 Toss 계좌 잔고 일괄 재등록: 그 계좌 매수분 삭제 → 빌려주기 출고·반환 상쇄 → BUY·입고 등록(시세 검증 없음) → SELL·실제 출고 LIFO 매도',
  })
  @ApiCreatedResponse({ type: BulkRegisterBalanceTossResponse })
  bulkRegisterToss(
    @CurrentUser() user: AuthUser,
    @Body({ schema: bulkRegisterBalanceTossSchema })
    body: BulkRegisterBalanceTossRequest,
  ): Promise<BulkRegisterBalanceTossResponse> {
    return this.balanceService.bulkRegisterToss(user, body);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '통합잔고 조회: 종목별 매입평균가·평가금액(원화/외화)·수익률과 한국/미국/전체 합계 (accountId를 주면 그 계좌 매수분만, 없으면 전체)',
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

  @Patch('purchases/account')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '매수분 계좌 이동: 종목·매수일·sequence로 매수분 하나를 내 다른 계좌로 옮김 (매도된 행도 가능, 타사 이전 등)',
  })
  updatePurchaseAccount(
    @CurrentUser() user: AuthUser,
    @Body({ schema: updatePurchaseAccountSchema })
    body: UpdatePurchaseAccountRequest,
  ): Promise<PurchaseDateBalance> {
    return this.balanceService.updatePurchaseAccount(user, body);
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
      '배당금 내역 조회: 배당락일 전날 보유수량 × 주당배당금, USD는 지급일 환율로 원화 환산, 기간 총배당금과 월별 내역 (accountId를 주면 그 계좌 보유분만)',
  })
  @ApiOkResponse({ type: DividendHistoryResponse })
  getDividendHistory(
    @CurrentUser() user: AuthUser,
    @Query({ schema: dividendHistorySchema }) query: DividendHistoryRequest,
  ): Promise<DividendHistoryResponse> {
    return this.dividendHistoryService.getDividendHistory(user, query);
  }

  @Get('dividend-metrics')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '배당 지표 조회: 현재 보유 종목별 최근 12개월 주당 배당·예상 연배당·YOC(매입가 대비 배당률)·현재 배당률·배당 성장률(세전)과 합계 (accountId를 주면 그 계좌 보유분만)',
  })
  @ApiOkResponse({ type: DividendMetricsResponse })
  getDividendMetrics(
    @CurrentUser() user: AuthUser,
    @Query({ schema: dividendMetricsSchema }) query: DividendMetricsRequest,
  ): Promise<DividendMetricsResponse> {
    return this.dividendMetricsService.getDividendMetrics(user, query);
  }

  @Get('returns')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '기간 총수익률 조회: 종료일 보유분 평가수익 + 기간 배당금, 원금 대비 수익금·수익률 (accountId를 주면 그 계좌만)',
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
      '월말별 원금·평가금액·평가금액+누적배당금 조회 (from~to 년월, 이번 달은 오늘 기준, 월별 합계 + 종목별, accountId를 주면 그 계좌만)',
  })
  @ApiOkResponse({ type: MonthlyBalanceResponse })
  getMonthlyBalance(
    @CurrentUser() user: AuthUser,
    @Query({ schema: monthlyBalanceSchema }) query: MonthlyBalanceRequest,
  ): Promise<MonthlyBalanceResponse> {
    return this.monthlyBalanceService.getMonthlyBalance(user, query);
  }
}
