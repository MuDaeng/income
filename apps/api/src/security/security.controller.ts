import { Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type ImportSecuritiesResult,
  SecurityService,
} from './security.service.js';

@ApiTags('security')
@Controller('securities')
export class SecurityController {
  constructor(private readonly securityService: SecurityService) {}

  @Post('import')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '종목 가져오기(일회성 배치): Toss Open API로 코스피·코스닥·미국 전체 종목을 security에 저장',
  })
  import(): Promise<ImportSecuritiesResult> {
    return this.securityService.importFromToss();
  }
}
