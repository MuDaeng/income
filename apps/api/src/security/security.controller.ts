import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type SearchSecuritiesRequest,
  searchSecuritiesSchema,
} from './search-securities.schema.js';
import { type ImportSecuritiesResult, SecurityImportService } from '@app/core';
import { SecuritySearchItemDto } from './security-search.dto.js';
import { SecurityService } from './security.service.js';

@ApiTags('security')
@Controller('securities')
export class SecurityController {
  constructor(
    private readonly securityService: SecurityService,
    private readonly securityImportService: SecurityImportService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      '종목 검색: symbol(완전일치) 또는 종목명(부분일치)으로 ISIN·종목명·symbol·최근 종가 (최대 20건)',
  })
  @ApiOkResponse({ type: [SecuritySearchItemDto] })
  search(
    @Query({ schema: searchSecuritiesSchema }) query: SearchSecuritiesRequest,
  ): Promise<SecuritySearchItemDto[]> {
    return this.securityService.searchSecurities(query);
  }

  @Post('import')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '종목 가져오기(일회성 배치): Toss Open API로 코스피·코스닥·미국 전체 종목을 security에 저장',
  })
  import(): Promise<ImportSecuritiesResult> {
    return this.securityImportService.importFromToss();
  }
}
