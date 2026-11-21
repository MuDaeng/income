import { ApiProperty } from '@nestjs/swagger';
import { AccountType, SecurityCompany } from '@app/common';

export class AccountDto {
  @ApiProperty({ description: '계좌 id (사용자별 순번)' })
  id: number;

  @ApiProperty({ enum: SecurityCompany, description: '증권사' })
  securityCompany: SecurityCompany;

  @ApiProperty({ enum: AccountType, description: '계좌 타입' })
  accountType: AccountType;
}

export class AccountListResponse {
  @ApiProperty({ type: [AccountDto], description: '계좌 목록 (id 순)' })
  accounts: AccountDto[];
}
