import { ApiProperty } from '@nestjs/swagger';
import {
  TOSS_ASSET_CLASSES,
  TOSS_CURRENCIES,
  TOSS_MARKET_COUNTRIES,
  TOSS_TRANSACTION_TYPES,
  type TossAssetClass,
  type TossCurrency,
  type TossMarketCountry,
  type TossTransactionType,
} from './bulk-register-balance-toss.schema.js';

/**
 * Toss 거래내역 한 건. 모든 금액·수량은 `currency` 통화의 부호 없는 decimal 문자열.
 * 요청 검증은 `tossTransactionSchema`가 한다.
 */
export class TossTransaction {
  @ApiProperty({
    enum: TOSS_TRANSACTION_TYPES,
    description: '거래 유형. 취소 거래는 원거래의 유형을 유지',
  })
  transactionType: TossTransactionType;

  @ApiProperty({
    enum: TOSS_MARKET_COUNTRIES,
    description: '거래가 속한 시장. 현금·환전 거래는 KRW → KR, USD → US',
  })
  marketCountry: TossMarketCountry;

  @ApiProperty({ enum: TOSS_CURRENCIES, description: '이 거래의 모든 금액이 표시된 통화' })
  currency: TossCurrency;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '종목 심볼 (주식: KRX 6자리/US 티커, 옵션: OCC 심볼). 채권·현금 거래는 null',
  })
  symbol: string | null;

  @ApiProperty({
    enum: TOSS_ASSET_CLASSES,
    nullable: true,
    description: '거래 상품군. 종목과 관련 없는 현금 거래는 null',
  })
  assetClass: TossAssetClass | null;

  @ApiProperty({ type: String, nullable: true, description: '거래 시점의 ISIN. 옵션·현금 거래는 null' })
  isinCode: string | null;

  @ApiProperty({ type: String, nullable: true, description: '수량. BUY·SELL·증권 입출고에만 제공' })
  quantity: string | null;

  @ApiProperty({ type: String, nullable: true, description: '매매 단가. BUY·SELL에만 제공, 미결제는 null' })
  filledPrice: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '환율 (1 USD당 KRW). USD 결제 완료 거래에만 제공',
  })
  exchangeRate: string | null;

  @ApiProperty({ description: 'KST 기준 결제일 YYYY-MM-DD. 미결제는 예상 결제일' })
  settlementDate: string;

  @ApiProperty({ description: '결제 완료 여부' })
  settled: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '결제 완료 내역의 거래 처리일시 (KST, +09:00). 미결제는 null',
  })
  transactionTime: string | null;

  @ApiProperty({ description: '국내 거래의 취소 여부. true이면 원거래는 목록에서 제외' })
  isCancellation: boolean;
}

/** 출고 한 건의 키 (거래 id가 없어 ISIN·결제일·수량·순번으로 구분) */
export class TossTransferKeyDto {
  @ApiProperty({ description: '출고 종목의 ISIN' })
  isinCode: string;

  @ApiProperty({ description: '결제일 YYYY-MM-DD' })
  settlementDate: string;

  @ApiProperty({ description: '출고 수량 (거래내역의 quantity)' })
  quantity: string;

  @ApiProperty({ description: '같은 (ISIN, 결제일, 수량) 출고 안에서의 순번 (0부터, 처리일시 순)' })
  index: number;
}

/** Toss 거래내역으로 잔고 일괄 등록 요청 */
export class BulkRegisterBalanceTossDto {
  @ApiProperty({
    required: false,
    description: '등록할 내 Toss 계좌 id (GET /accounts). 생략하면 첫 Toss 계좌, 없으면 일반 계좌를 새로 만든다',
  })
  accountId?: number;

  @ApiProperty({
    type: [TossTransferKeyDto],
    required: false,
    description: '매도로 처리할 출고 (타사 이체 등 실제로 나간 주식). 출고는 기본으로 주식 빌려주기로 보고 매도하지 않는다. 응답 lentTransfers의 key를 그대로 보낸다',
  })
  confirmedTransfersOut?: TossTransferKeyDto[];

  @ApiProperty({
    type: [TossTransaction],
    description: '거래 목록. 미결제 먼저, 각 그룹 안에서는 정렬 기준 시각의 최신순',
  })
  transactionList: TossTransaction[];
}

/** 건너뛴 거래 한 건 */
export class TossSkippedTransactionDto {
  @ApiProperty({ description: '거래 유형 (BUY·SELL·SECURITIES_TRANSFER_IN·SECURITIES_TRANSFER_OUT)' })
  transactionType: string;

  @ApiProperty({ type: String, nullable: true, description: '거래의 ISIN' })
  isinCode: string | null;

  @ApiProperty({ description: '건너뛴 이유 (취소 거래 / 종목을 찾을 수 없음 / 수량 또는 단가 없음 / 입고일 시세 없음 / 빌려주기 반환 / 빌려주기 출고(반환됨))' })
  reason: string;
}

/** 아직 반환되지 않은 빌려주기 출고 (대여 중으로 보고 매도하지 않은 출고) */
export class TossLentTransferDto {
  @ApiProperty({ type: TossTransferKeyDto, description: '실제 출고였다면 다음 요청의 confirmedTransfersOut에 그대로 보낼 키' })
  key: TossTransferKeyDto;

  @ApiProperty({ description: '아직 반환되지 않은 수량 (부분 반환이면 출고 수량보다 적다)' })
  remainingQuantity: string;
}

/** Toss 거래내역 일괄 등록 결과 */
export class BulkRegisterBalanceTossResponse {
  @ApiProperty({ description: '등록한 계좌 id' })
  accountId: number;

  @ApiProperty({ description: '삭제한 그 계좌의 기존 매수분(매도분 포함) 행 수' })
  deletedCount: number;

  @ApiProperty({ description: '등록한 BUY·SECURITIES_TRANSFER_IN 거래 수 (빌려주기 반환으로 전량 상쇄된 입고 제외)' })
  boughtCount: number;

  @ApiProperty({ description: '매도 처리한 SELL·실제 출고(confirmedTransfersOut) 거래 수' })
  soldCount: number;

  @ApiProperty({ type: [TossSkippedTransactionDto], description: '건너뛴 매수·매도·입출고 거래' })
  skipped: TossSkippedTransactionDto[];

  @ApiProperty({ type: [TossLentTransferDto], description: '대여 중으로 보고 무시한 출고 (실제 출고면 confirmedTransfersOut으로 다시 요청)' })
  lentTransfers: TossLentTransferDto[];
}
