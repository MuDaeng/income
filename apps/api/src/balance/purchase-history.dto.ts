import { ApiProperty } from '@nestjs/swagger';
import { DailyPriceSecurityDto } from '../security/daily-price.dto.js';

/** 수량·가격은 decimal 문자열 (KRW 정수; USD 수량은 소수 6자리, 가격은 소수 2자리 버림) */
export class PurchaseHistoryItemDto {
  @ApiProperty({ description: '매수일 YYYY-MM-DD' })
  purchaseDate: string;

  @ApiProperty({ description: '같은 매수일 안의 순번 (매도 등록 시 사용)' })
  sequence: number;

  @ApiProperty({ description: '수량' })
  amount: string;

  @ApiProperty({ description: '매수 가격 (종목 통화, KRW 정수·USD 소수 2자리 버림)' })
  price: string;

  @ApiProperty({ type: String, nullable: true, description: '매도일 YYYY-MM-DD (보유 중이면 null)' })
  saleDate: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      '구매 환율: USD 종목은 매수분에 저장된 환율, 없으면 매수일(이전 최근) USD 종가 환율. KRW 종목·환율 없음은 null',
  })
  exchangeRate: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '대체로 쓴 USD 종가 환율의 기준일 YYYY-MM-DD (저장된 구매 환율이면 null)',
  })
  exchangeRateDate: string | null;
}

export class PurchaseHistoryResponse {
  @ApiProperty({ type: DailyPriceSecurityDto })
  security: DailyPriceSecurityDto;

  @ApiProperty({ type: [PurchaseHistoryItemDto], description: '매수 내역 (매수일 최신순)' })
  items: PurchaseHistoryItemDto[];
}
