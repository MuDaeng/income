import { ApiProperty } from '@nestjs/swagger';
import { Currency } from '@app/common';

/** 성장률 계산 방식. TOTAL: 12개월 합끼리, PER_PAYMENT: 회당 평균끼리 (KRW 종목만, 첫 배당이 직전 12개월 안이라 직전 기간이 덜 찬 종목) */
export type GrowthBasis = 'TOTAL' | 'PER_PAYMENT';

/**
 * 배당 지표 응답 DTO. 금액·수량은 decimal 문자열(원화 정수, 외화 소수 6자리 버림),
 * 비율은 퍼센트(소수 2자리 버림). 배당은 세전 금액.
 */
export class DividendMetricsItemDto {
  @ApiProperty({ description: '종목 코드' })
  securityId: string;

  @ApiProperty({ description: '종목 심볼 (화면 표시용)' })
  symbol: string;

  @ApiProperty({ description: '종목명' })
  name: string;

  @ApiProperty({ enum: Currency, description: '종목 통화' })
  currency: Currency;

  @ApiProperty({ description: '현재 보유 수량' })
  quantity: string;

  @ApiProperty({ description: '최근 12개월(오늘−1년 초과 ~ 오늘) 지급된 주당 현금배당 합 (종목 통화)' })
  trailingPerShare: string;

  @ApiProperty({ description: '최근 12개월 지급 횟수' })
  paymentCount: number;

  @ApiProperty({ description: '그 직전 12개월 주당 현금배당 합 (종목 통화)' })
  previousPerShare: string;

  @ApiProperty({ description: '직전 12개월 지급 횟수' })
  previousPaymentCount: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      '배당 성장률(%) = 최근 12개월 ÷ 직전 12개월 − 1 (growthBasis가 PER_PAYMENT면 회당 평균끼리). 직전 12개월 배당이 없으면 null',
  })
  growthRate: string | null;

  @ApiProperty({
    enum: ['TOTAL', 'PER_PAYMENT'],
    description:
      '성장률 계산 방식. TOTAL: 12개월 합끼리, PER_PAYMENT: KRW 종목의 첫 현금배당이 직전 12개월 안이고 직전 지급 횟수가 최근보다 적어(상장 1년 남짓) 회당 평균끼리 비교',
  })
  growthBasis: GrowthBasis;

  @ApiProperty({ description: '예상 연배당 (종목 통화) = 최근 12개월 주당 배당 × 현재 수량' })
  annualDividend: string;

  @ApiProperty({ description: '예상 연배당 (원화, USD는 최신 환율로 환산)' })
  krwAnnualDividend: string;

  @ApiProperty({ description: '현재 보유분 원금 (원화, USD는 매수분마다 구매 환율)' })
  krwPurchaseAmount: string;

  @ApiProperty({ type: String, nullable: true, description: '최신 종가 (종목 통화, 시세가 없으면 null)' })
  closingPrice: string | null;

  @ApiProperty({ type: String, nullable: true, description: '종가 기준일 YYYY-MM-DD' })
  priceDate: string | null;

  @ApiProperty({ type: String, nullable: true, description: '평가금액 (원화, 시세가 없으면 null)' })
  krwEvaluationAmount: string | null;

  @ApiProperty({ type: String, nullable: true, description: '매입가 대비 배당률 YOC(%) = 원화 예상 연배당 ÷ 원화 원금. 원금이 0이면 null' })
  yieldOnCost: string | null;

  @ApiProperty({ type: String, nullable: true, description: '현재 배당률(%) = 최근 12개월 주당 배당 ÷ 최신 종가. 시세가 없으면 null' })
  currentYield: string | null;
}

export class DividendMetricsTotalDto {
  @ApiProperty({ description: '예상 연배당 합계 (원화)' })
  krwAnnualDividend: string;

  @ApiProperty({ description: '원금 합계 (원화)' })
  krwPurchaseAmount: string;

  @ApiProperty({ description: '평가금액 합계 (원화, 시세 없는 종목 제외)' })
  krwEvaluationAmount: string;

  @ApiProperty({ type: String, nullable: true, description: 'YOC(%) = 예상 연배당 합계 ÷ 원금 합계. 원금이 0이면 null' })
  yieldOnCost: string | null;

  @ApiProperty({ type: String, nullable: true, description: '현재 배당률(%) = 시세 있는 종목의 예상 연배당 ÷ 평가금액 합계. 평가금액이 0이면 null' })
  currentYield: string | null;
}

export class DividendMetricsResponse {
  @ApiProperty({ description: '기준일 YYYY-MM-DD (한국 시간 오늘)' })
  date: string;

  @ApiProperty({ type: String, nullable: true, description: 'USD 환산에 쓴 최신 환율 (USD 보유 종목이 없으면 null)' })
  exchangeRate: string | null;

  @ApiProperty({ type: String, nullable: true, description: '환율 기준일 YYYY-MM-DD' })
  exchangeRateDate: string | null;

  @ApiProperty({ type: [DividendMetricsItemDto], description: '현재 보유 종목별 지표 (종목 코드순)' })
  items: DividendMetricsItemDto[];

  @ApiProperty({ type: DividendMetricsTotalDto })
  total: DividendMetricsTotalDto;
}
