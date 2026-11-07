import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PurchaseDateBalance } from '@app/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/jwt.strategy.js';
import { BalanceService } from './balance.service.js';
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
}
