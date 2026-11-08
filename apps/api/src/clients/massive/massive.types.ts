/** Custom Bars(OHLC) 응답의 바 하나. 외환은 체결가가 아니라 호가(bid/ask)로 만든 값 */
export interface MassiveAggregateBar {
  /** 시가 */
  o: number;
  /** 고가 */
  h: number;
  /** 저가 */
  l: number;
  /** 종가 */
  c: number;
  /** 구간 시작 시각 (Unix 밀리초, UTC) */
  t: number;
  v?: number;
  vw?: number;
  n?: number;
}

/** Daily Market Summary(grouped daily)의 행 하나. `T`는 티커 */
export interface MassiveGroupedBar extends MassiveAggregateBar {
  T: string;
}

export interface MassiveGroupedResponse {
  status: string;
  resultsCount?: number;
  results?: MassiveGroupedBar[];
}

export interface MassiveAggregatesResponse {
  ticker: string;
  status: string;
  resultsCount?: number;
  results?: MassiveAggregateBar[];
}

/** Dividends(/stocks/v1/dividends)의 현금배당 한 건. 날짜는 'YYYY-MM-DD' (없을 수 있음) */
export interface MassiveDividend {
  id: string;
  ticker: string;
  /** 주당 배당금 (currency 기준) */
  cash_amount: number;
  currency: string;
  declaration_date?: string;
  ex_dividend_date?: string;
  record_date?: string;
  pay_date?: string;
  frequency?: number;
  distribution_type?: string;
}

export interface MassiveDividendsResponse {
  status: string;
  results?: MassiveDividend[];
  /** 다음 페이지 URL (Authorization 헤더는 그대로 보내야 함) */
  next_url?: string;
}
