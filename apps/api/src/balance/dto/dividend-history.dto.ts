import { ApiProperty } from '@nestjs/swagger';
import { Currency } from '@app/common';

/**
 * 배당금 내역 응답 DTO. 금액·수량은 모두 decimal 문자열.
 * 원화 금액은 정수, 외화(USD) 금액은 소수 6자리로 버림.
 */
export class DividendItemDto {
  @ApiProperty({ description: '종목 코드' })
  securityId: string;

  @ApiProperty({ description: '종목명' })
  name: string;

  @ApiProperty({ enum: Currency, description: '종목 통화' })
  currency: Currency;

  @ApiProperty({ description: '배당 기준일 YYYY-MM-DD (이 날 보유한 수량으로 계산)' })
  noticeDate: string;

  @ApiProperty({ description: '배당 지급일 YYYY-MM-DD' })
  paymentDate: string;

  @ApiProperty({ description: '주당 배당금 (종목 통화)' })
  perShareAmount: string;

  @ApiProperty({ description: '기준일 보유 수량' })
  quantity: string;

  @ApiProperty({ description: '배당금 (종목 통화) = 주당 배당금 × 보유 수량' })
  amount: string;

  @ApiProperty({ type: String, nullable: true, description: '달러 배당금 (KRW 종목은 null)' })
  usdAmount: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '원화 배당금 (USD 종목은 지급일 환율로 환산, 환율이 없으면 null)',
  })
  krwAmount: string | null;

  @ApiProperty({ type: String, nullable: true, description: '원화 환산에 쓴 USD 환율 (KRW 종목·환율 없음은 null)' })
  exchangeRate: string | null;

  @ApiProperty({ type: String, nullable: true, description: '환율 기준일 YYYY-MM-DD (지급일 또는 그 직전 영업일)' })
  exchangeRateDate: string | null;
}

export class DividendSummaryDto {
  @ApiProperty({ description: '한국증권(KRW) 배당금 합계 (원화)' })
  krwAmount: string;

  @ApiProperty({ description: '미국증권(USD) 배당금 합계 (달러)' })
  usdAmount: string;

  @ApiProperty({ description: '미국증권(USD) 배당금 원화 환산 합계 (환율 없는 건 제외)' })
  usdKrwAmount: string;

  @ApiProperty({ description: '총배당금 (원화) = KRW 합계 + USD 원화 환산 합계' })
  totalKrwAmount: string;
}

export class MonthlyDividendDto {
  @ApiProperty({ description: '지급월 YYYY-MM' })
  month: string;

  @ApiProperty({ type: DividendSummaryDto, description: '월 합계' })
  summary: DividendSummaryDto;

  @ApiProperty({ type: [DividendItemDto], description: '월 배당 내역 (지급일·종목 순)' })
  items: DividendItemDto[];
}

export class DividendHistoryResponse {
  @ApiProperty({ type: String, nullable: true, description: '조회 시작일 (입력값, 없으면 null)' })
  from: string | null;

  @ApiProperty({ type: String, nullable: true, description: '조회 종료일 (입력값, 없으면 null)' })
  to: string | null;

  @ApiProperty({ type: DividendSummaryDto, description: '기간 총배당금' })
  total: DividendSummaryDto;

  @ApiProperty({ type: [MonthlyDividendDto], description: '월별 배당 내역 (월 오름차순)' })
  months: MonthlyDividendDto[];
}
