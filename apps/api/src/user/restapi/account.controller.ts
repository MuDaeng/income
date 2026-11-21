import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/restapi/current-user.decorator.js';
import type { AuthUser } from '../../auth/restapi/jwt.strategy.js';
import { AccountService } from './account.service.js';
import { AccountDto, AccountListResponse } from './dto/account.dto.js';
import {
  type AccountListRequest,
  accountListSchema,
} from './dto/account-list.schema.js';
import {
  type CreateAccountRequest,
  createAccountSchema,
} from './dto/create-account.schema.js';
import {
  type AccountIdParam,
  accountIdParamSchema,
  type UpdateAccountTypeRequest,
  updateAccountTypeSchema,
} from './dto/update-account-type.schema.js';

@ApiTags('account')
@Controller('accounts')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '내 계좌 목록 (securityCompany를 주면 그 증권사 계좌만, 없으면 전체)',
  })
  @ApiOkResponse({ type: AccountListResponse })
  getAccounts(
    @CurrentUser() user: AuthUser,
    @Query({ schema: accountListSchema }) query: AccountListRequest,
  ): Promise<AccountListResponse> {
    return this.accountService.getAccounts(user, query);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: '계좌 생성 (accountType 생략 시 일반 계좌, id는 내 계좌 중 max + 1)',
  })
  @ApiCreatedResponse({ type: AccountDto })
  createAccount(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createAccountSchema }) body: CreateAccountRequest,
  ): Promise<AccountDto> {
    return this.accountService.createAccount(user, body);
  }

  @Patch(':id/type')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '계좌 타입 변경 (일반·ISA·IRP·연금저축)' })
  @ApiOkResponse({ type: AccountDto })
  updateAccountType(
    @CurrentUser() user: AuthUser,
    @Param({ schema: accountIdParamSchema }) param: AccountIdParam,
    @Body({ schema: updateAccountTypeSchema }) body: UpdateAccountTypeRequest,
  ): Promise<AccountDto> {
    return this.accountService.updateAccountType(user, param, body);
  }
}
