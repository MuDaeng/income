import { ApiProperty } from '@nestjs/swagger';
import { Currency } from '@app/common';

export class DailyPriceSecurityDto {
  @ApiProperty({ description: '종목 코드 (ISIN)' })
  id: string;

  @ApiProperty({ description: 'symbol (국내 6자리 코드, 미국 티커)' })
  symbol: string;

  @ApiProperty({ description: '종목명' })
  name: string;

  @ApiProperty({ enum: Currency, description: '종목 통화' })
  currency: Currency;
}

/** 가격은 decimal 문자열. KRW는 정수, USD는 소수 6자리로 버림 */
export class DailyPriceDto {
  @ApiProperty({ description: '일자 YYYY-MM-DD' })
  date: string;

  @ApiProperty({ description: '시가' })
  openingPrice: string;

  @ApiProperty({ description: '종가' })
  closingPrice: string;

  @ApiProperty({ description: '고가' })
  highestPrice: string;

  @ApiProperty({ description: '저가' })
  lowestPrice: string;
}

export class DailyPriceResponse {
  @ApiProperty({ type: DailyPriceSecurityDto })
  security: DailyPriceSecurityDto;

  @ApiProperty({ type: String, nullable: true, description: '조회 시작일 (입력값, 없으면 null)' })
  from: string | null;

  @ApiProperty({ type: String, nullable: true, description: '조회 종료일 (입력값, 없으면 null)' })
  to: string | null;

  @ApiProperty({ type: [DailyPriceDto], description: '일별 시세 (날짜 오름차순)' })
  prices: DailyPriceDto[];
}
