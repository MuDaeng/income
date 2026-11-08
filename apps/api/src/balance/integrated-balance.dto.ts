import { ApiProperty } from '@nestjs/swagger';
import { Currency } from '@app/common';

/**
 * 통합잔고 응답 DTO. 금액·수량·수익률은 모두 decimal 문자열.
 * 원화 금액은 정수, 외화(USD) 금액은 소수 6자리로 버림. 수익률은 퍼센트(소수 2자리).
 */
export class BalanceItemDto {
  @ApiProperty({ description: '종목 코드' })
  securityId: string;

  @ApiProperty({ description: '종목명' })
  name: string;

  @ApiProperty({ enum: Currency, description: '종목 통화' })
  currency: Currency;

  @ApiProperty({ description: '총 보유 수량' })
  amount: string;

  @ApiProperty({ description: '최신 종가 (종목 통화)' })
  currentPrice: string;

  @ApiProperty({ description: '원화 매입평균가' })
  krwAveragePrice: string;

  @ApiProperty({ type: String, nullable: true, description: '외화 매입평균가 (KRW 종목은 null)' })
  usdAveragePrice: string | null;

  @ApiProperty({ description: '원화 총매입금액' })
  krwPurchaseAmount: string;

  @ApiProperty({ type: String, nullable: true, description: '외화 총매입금액 (KRW 종목은 null)' })
  usdPurchaseAmount: string | null;

  @ApiProperty({ description: '원화 평가금액 (최신 종가 × 수량)' })
  krwEvaluationAmount: string;

  @ApiProperty({ type: String, nullable: true, description: '외화 평가금액 (KRW 종목은 null)' })
  usdEvaluationAmount: string | null;

  @ApiProperty({ description: '수익률(%) = (평가금액 − 총매입금액) / 총매입금액 × 100' })
  returnRate: string;
}

export class BalanceSummaryDto {
  @ApiProperty({ description: '총매입금액 (원화)' })
  purchaseAmount: string;

  @ApiProperty({ description: '평가금액 (원화)' })
  evaluationAmount: string;

  @ApiProperty({ description: '수익률(%)' })
  returnRate: string;
}

export class UsdBalanceSummaryDto {
  @ApiProperty({ description: '외화 총매입금액' })
  usdPurchaseAmount: string;

  @ApiProperty({ description: '외화 평가금액' })
  usdEvaluationAmount: string;

  @ApiProperty({ description: '원화 환산 총매입금액' })
  krwPurchaseAmount: string;

  @ApiProperty({ description: '원화 환산 평가금액' })
  krwEvaluationAmount: string;

  @ApiProperty({ description: '수익률(%)' })
  returnRate: string;
}

export class IntegratedBalanceResponse {
  @ApiProperty({ type: [BalanceItemDto], description: '종목별 잔고' })
  items: BalanceItemDto[];

  @ApiProperty({ type: BalanceSummaryDto, description: '한국증권(KRW) 총합' })
  krwTotal: BalanceSummaryDto;

  @ApiProperty({ type: UsdBalanceSummaryDto, description: '미국증권(USD) 총합' })
  usdTotal: UsdBalanceSummaryDto;

  @ApiProperty({ type: BalanceSummaryDto, description: '한국 + 미국(원화 환산) 총합' })
  total: BalanceSummaryDto;

  @ApiProperty({ type: String, nullable: true, description: '원화 환산에 쓴 USD 최신 종가 환율 (USD 종목이 없으면 null)' })
  exchangeRate: string | null;

  @ApiProperty({ type: String, nullable: true, description: '환율 기준일 YYYY-MM-DD' })
  exchangeRateDate: string | null;
}
