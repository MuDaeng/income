/** POST /oauth2/tokenP 응답 */
export interface KisTokenResponse {
  access_token: string;
  token_type: string;
  /** 유효 시간(초), 보통 86400 */
  expires_in: number;
  /** 만료 시각 'YYYY-MM-DD HH:mm:ss' */
  access_token_token_expired?: string;
}

/**
 * 예탁원정보(배당일정) 한 행. 값은 모두 문자열(없으면 빈 문자열).
 * 기준일은 'YYYYMMDD', 지급일은 'YYYY/MM/DD' 형식으로 온다
 */
export interface KisDividendItem {
  /** 기준일 */
  record_date: string;
  /** 종목코드 */
  sht_cd: string;
  isin_name?: string;
  /** 배당종류 */
  divi_kind?: string;
  /** 액면가 */
  face_val?: string;
  /** 주당 현금배당금 */
  per_sto_divi_amt: string;
  /** 현금배당률(%) */
  divi_rate?: string;
  /** 주식배당률(%) */
  stk_divi_rate: string;
  /** 배당금 지급일 */
  divi_pay_dt: string;
  /** 주식배당 지급일 */
  stk_div_pay_dt: string;
  odd_pay_dt?: string;
  stk_kind?: string;
  high_divi_gb?: string;
}

/** GET /uapi/domestic-stock/v1/ksdinfo/dividend 응답 */
export interface KisDividendResponse {
  /** '0'이면 성공 */
  rt_cd: string;
  msg_cd: string;
  msg1: string;
  output1?: KisDividendItem[];
  /** 연속조회 키. 다음 요청의 CTS로 넘김 */
  CTS?: string;
}
