import { ApiProperty } from '@nestjs/swagger';
import { Currency } from '@app/common';

export class SecuritySearchItemDto {
  @ApiProperty({ description: 'ISIN 코드 (일별 시세 조회 등에 쓰는 securityId)' })
  id: string;

  @ApiProperty({ description: 'symbol (국내 6자리 코드, 미국 티커)' })
  symbol: string;

  @ApiProperty({ description: '종목명' })
  name: string;

  @ApiProperty({ enum: Currency, description: '종목 통화' })
  currency: Currency;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '최근 종가 (KRW 정수, USD 소수 6자리 버림). 시세가 없으면 null',
  })
  closingPrice: string | null;

  @ApiProperty({ type: String, nullable: true, description: '최근 종가 일자 YYYY-MM-DD' })
  priceDate: string | null;
}
