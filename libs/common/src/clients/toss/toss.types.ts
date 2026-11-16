/** `GET /api/v1/stocks/all`의 `market` 값 */
export type TossMarket =
  | 'KOSPI'
  | 'KOSDAQ'
  | 'NYSE'
  | 'NASDAQ'
  | 'AMEX'
  | 'KR_ETC'
  | 'US_ETC';

export type TossSecurityType =
  | 'STOCK'
  | 'FOREIGN_STOCK'
  | 'DEPOSITARY_RECEIPT'
  | 'INFRASTRUCTURE_FUND'
  | 'REIT'
  | 'ETF'
  | 'FOREIGN_ETF'
  | 'ETN'
  | 'STOCK_WARRANTS';

/** `GET /api/v1/stocks/all` 응답 `result`의 항목 */
export interface TossListedStock {
  /** 종목 코드 (예: '005930', 'AAPL') */
  symbol: string;
  /** 한글 종목명 */
  name: string;
  securityType: TossSecurityType;
  isCommonShare: boolean;
  /** ISIN (예: 'KR7005930003') */
  isinCode: string;
}
