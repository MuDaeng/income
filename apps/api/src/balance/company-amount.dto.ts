import { ApiProperty } from '@nestjs/swagger';
import { SecurityCompany } from '@app/common';

/** 증권사 하나의 보유 수량 (decimal 문자열, KRW 정수·USD 소수 6자리 버림) */
export class CompanyAmountDto {
  @ApiProperty({ enum: SecurityCompany, description: '증권사' })
  securityCompany: SecurityCompany;

  @ApiProperty({ description: '그 증권사의 보유 수량 (매도하지 않은 매수분 합)' })
  amount: string;
}
