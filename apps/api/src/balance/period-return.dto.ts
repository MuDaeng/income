import { ApiProperty } from '@nestjs/swagger';
import { Currency } from '@app/common';

/**
 * 기간 총수익률 응답 DTO. 금액·수량은 decimal 문자열.
 * 원화 금액은 정수, 외화(USD) 금액은 소수 6자리로 버림. 수익률은 퍼센트(소수 2자리 버림).
 */
export class EvaluationItemDto {
  @ApiProperty({ description: '종목 코드' })
  securityId: string;

  @ApiProperty({ description: '종목명' })
  name: string;

  @ApiProperty({ enum: Currency, description: '종목 통화' })
  currency: Currency;

  @ApiProperty({ description: '종료일 보유 수량 (기간 중 전량 매도면 0)' })
  quantity: string;

  @ApiProperty({ type: String, nullable: true, description: '종료일(이전 최근) 종가, 종목 통화 (보유 수량 0이면 null)' })
  closingPrice: string | null;

  @ApiProperty({ type: String, nullable: true, description: '종가 기준일 YYYY-MM-DD' })
  priceDate: string | null;

  @ApiProperty({ type: String, nullable: true, description: '외화 원금 (KRW 종목은 null)' })
  usdPurchaseAmount: string | null;

  @ApiProperty({ type: String, nullable: true, description: '외화 평가금액 (KRW 종목은 null)' })
  usdEvaluationAmount: string | null;

  @ApiProperty({ description: '원화 원금 (USD는 매수분마다 저장된 구매 환율, 없으면 매수일 환율로 환산)' })
  krwPurchaseAmount: string;

  @ApiProperty({ description: '원화 평가금액 (USD는 종료일 환율로 환산)' })
  krwEvaluationAmount: string;

  @ApiProperty({ description: '평가 수익금 (원화) = 평가금액 − 원금' })
  profit: string;

  @ApiProperty({ description: '평가 수익률(%)' })
  returnRate: string;
}

export class EvaluationSummaryDto {
  @ApiProperty({ description: '원금 합계 (원화)' })
  purchaseAmount: string;

  @ApiProperty({ description: '평가금액 합계 (원화)' })
  evaluationAmount: string;

  @ApiProperty({ description: '평가 수익금 합계 (원화)' })
  profit: string;

  @ApiProperty({ description: '평가 수익률(%)' })
  returnRate: string;
}

export class EvaluationSectionDto {
  @ApiProperty({ type: [EvaluationItemDto] })
  items: EvaluationItemDto[];

  @ApiProperty({ type: EvaluationSummaryDto })
  total: EvaluationSummaryDto;
}

export class DividendSumItemDto {
  @ApiProperty({ description: '종목 코드' })
  securityId: string;

  @ApiProperty({ description: '종목명' })
  name: string;

  @ApiProperty({ enum: Currency, description: '종목 통화' })
  currency: Currency;

  @ApiProperty({ type: String, nullable: true, description: '기간 달러 배당금 합계 (KRW 종목은 null)' })
  usdAmount: string | null;

  @ApiProperty({ description: '기간 원화 배당금 합계 (USD는 지급일 환율 환산, 환율 없는 건 제외)' })
  krwAmount: string;
}

export class DividendSumSummaryDto {
  @ApiProperty({ description: '달러 배당금 합계' })
  usdAmount: string;

  @ApiProperty({ description: '원화 배당금 합계 (USD 원화 환산 포함)' })
  krwAmount: string;
}

export class DividendSumSectionDto {
  @ApiProperty({ type: [DividendSumItemDto] })
  items: DividendSumItemDto[];

  @ApiProperty({ type: DividendSumSummaryDto })
  total: DividendSumSummaryDto;
}

export class TotalReturnItemDto {
  @ApiProperty({ description: '종목 코드' })
  securityId: string;

  @ApiProperty({ description: '종목명' })
  name: string;

  @ApiProperty({ description: '원금 (원화)' })
  purchaseAmount: string;

  @ApiProperty({ description: '평가금액 (원화)' })
  evaluationAmount: string;

  @ApiProperty({ description: '배당금 합계 (원화)' })
  dividendAmount: string;

  @ApiProperty({ description: '평가금액 + 배당금 (원화)' })
  totalAmount: string;

  @ApiProperty({ description: '원금 대비 수익금 = 평가금액 + 배당금 − 원금' })
  profit: string;

  @ApiProperty({ description: '원금 대비 수익률(%)' })
  returnRate: string;
}

export class TotalReturnSummaryDto {
  @ApiProperty({ description: '원금 합계 (원화)' })
  purchaseAmount: string;

  @ApiProperty({ description: '평가금액 합계 (원화)' })
  evaluationAmount: string;

  @ApiProperty({ description: '배당금 합계 (원화)' })
  dividendAmount: string;

  @ApiProperty({ description: '평가금액 + 배당금 합계 (원화)' })
  totalAmount: string;

  @ApiProperty({ description: '원금 대비 수익금 합계' })
  profit: string;

  @ApiProperty({ description: '원금 대비 수익률(%)' })
  returnRate: string;
}

export class TotalReturnSectionDto {
  @ApiProperty({ type: [TotalReturnItemDto] })
  items: TotalReturnItemDto[];

  @ApiProperty({ type: TotalReturnSummaryDto })
  total: TotalReturnSummaryDto;
}

export class PeriodReturnResponse {
  @ApiProperty({ description: '조회 시작일' })
  from: string;

  @ApiProperty({ description: '조회 종료일 (평가 기준일)' })
  to: string;

  @ApiProperty({ type: String, nullable: true, description: '평가에 쓴 USD 환율 (종료일 이전 최근 종가, USD 보유 없으면 null)' })
  exchangeRate: string | null;

  @ApiProperty({ type: String, nullable: true, description: '환율 기준일 YYYY-MM-DD' })
  exchangeRateDate: string | null;

  @ApiProperty({ type: EvaluationSectionDto, description: '평가금액 정보 (종료일 보유분)' })
  evaluation: EvaluationSectionDto;

  @ApiProperty({ type: DividendSumSectionDto, description: '기간 배당금 정보' })
  dividend: DividendSumSectionDto;

  @ApiProperty({ type: TotalReturnSectionDto, description: '평가금액 + 배당금 총합 정보' })
  total: TotalReturnSectionDto;
}
