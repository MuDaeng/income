import { ApiProperty } from '@nestjs/swagger';
import { SecurityCompany } from '@app/common';

export class SecurityCompanyListResponse {
  @ApiProperty({
    enum: SecurityCompany,
    isArray: true,
    description: '매수 기록이 있는 증권사 (중복 없음, 매도한 매수분 포함, enum 선언 순서)',
  })
  securityCompanies: SecurityCompany[];
}
