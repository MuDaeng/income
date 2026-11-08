import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
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
import { IntegratedBalanceResponse } from './integrated-balance.dto.js';
import {
  type RegisterBalanceRequest,
  registerBalanceSchema,
} from './register-balance.schema.js';

@ApiTags('balance')
@Controller('balance')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

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
}
