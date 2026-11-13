import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type SearchSecuritiesRequest,
  searchSecuritiesSchema,
} from './search-securities.schema.js';
import { SecuritySearchItemDto } from './security-search.dto.js';
import { SecurityService } from './security.service.js';

@ApiTags('security')
@Controller('securities')
export class SecurityController {
  constructor(private readonly securityService: SecurityService) {}

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
}
