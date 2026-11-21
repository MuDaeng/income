import { ApiProperty } from '@nestjs/swagger';
import { AccountType, SecurityCompany } from '@app/common';

/** 계좌 하나의 보유 수량 (decimal 문자열, KRW 정수·USD 소수 6자리 버림) */
export class AccountAmountDto {
  @ApiProperty({ description: '계좌 id' })
  accountId: number;

  @ApiProperty({ enum: SecurityCompany, description: '계좌의 증권사' })
  securityCompany: SecurityCompany;

  @ApiProperty({ enum: AccountType, description: '계좌 타입' })
  accountType: AccountType;

  @ApiProperty({ description: '그 계좌의 보유 수량 (매도하지 않은 매수분 합)' })
  amount: string;
}
