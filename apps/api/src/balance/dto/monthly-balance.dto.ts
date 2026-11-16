import { ApiProperty } from '@nestjs/swagger';
import { Currency } from '@app/common';

/** 월말별 잔고 응답 DTO. 금액은 원화 정수 decimal 문자열 */
export class MonthlyBalanceItemDto {
  @ApiProperty({ description: '종목 코드' })
  securityId: string;

  @ApiProperty({ description: '종목명' })
  name: string;

  @ApiProperty({ enum: Currency, description: '종목 통화' })
  currency: Currency;

  @ApiProperty({ description: '기준일 보유 수량 (매도 후 배당만 남은 종목은 0)' })
  quantity: string;

  @ApiProperty({ description: '원금 (원화, USD는 매수분마다 저장된 구매 환율, 없으면 매수일 환율로 환산)' })
  purchaseAmount: string;

  @ApiProperty({ description: '평가금액 (원화) = 기준일(이전 최근) 종가 × 수량, USD는 기준일 환율로 환산' })
  evaluationAmount: string;

  @ApiProperty({ description: '누적배당금 (원화) = 처음부터 기준일까지 지급된 배당금 합계' })
  dividendAmount: string;

  @ApiProperty({ description: '평가금액 + 누적배당금 (원화)' })
  totalAmount: string;
}

export class MonthlyBalanceTotalDto {
  @ApiProperty({ description: '원금 합계 (원화)' })
  purchaseAmount: string;

  @ApiProperty({ description: '평가금액 합계 (원화)' })
  evaluationAmount: string;

  @ApiProperty({ description: '누적배당금 합계 (원화)' })
  dividendAmount: string;

  @ApiProperty({ description: '평가금액 + 누적배당금 합계 (원화)' })
  totalAmount: string;
}

export class MonthlyBalanceMonthDto {
  @ApiProperty({ description: '년월 YYYY-MM' })
  month: string;

  @ApiProperty({ description: '평가 기준일 YYYY-MM-DD (월말, 이번 달이면 오늘)' })
  date: string;

  @ApiProperty({ type: MonthlyBalanceTotalDto, description: '월 합계 (종목별 값을 더함)' })
  total: MonthlyBalanceTotalDto;

  @ApiProperty({
    type: [MonthlyBalanceItemDto],
    description: '종목별 값 (기준일 보유 종목 ∪ 누적배당금이 있는 종목, 종목 코드 순)',
  })
  items: MonthlyBalanceItemDto[];
}

export class MonthlyBalanceResponse {
  @ApiProperty({ description: '시작 년월 YYYY-MM' })
  from: string;

  @ApiProperty({ description: '종료 년월 YYYY-MM' })
  to: string;

  @ApiProperty({ type: [MonthlyBalanceMonthDto], description: '월별 값 (오래된 달부터)' })
  months: MonthlyBalanceMonthDto[];
}
