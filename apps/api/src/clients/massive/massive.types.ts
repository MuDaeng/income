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
