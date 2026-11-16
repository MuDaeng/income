import { ApiProperty } from '@nestjs/swagger';
import { DailyPriceSecurityDto } from './daily-price.dto.js';

/** 금액은 decimal 문자열. KRW는 정수, USD는 소수 6자리로 버림 */
export class MonthlyDividendDto {
  @ApiProperty({ description: '지급월 YYYY-MM' })
  month: string;

  @ApiProperty({ description: '그 달 지급된 1주당 현금배당금 합계' })
  amount: string;

  @ApiProperty({ description: '그 달 배당 지급 횟수' })
  count: number;
}

export class MonthlyDividendResponse {
  @ApiProperty({ type: DailyPriceSecurityDto })
  security: DailyPriceSecurityDto;

  @ApiProperty({ type: [MonthlyDividendDto], description: '월별 배당금 (월 오름차순)' })
  months: MonthlyDividendDto[];
}
