/** 금융위원회 주식시세정보 getStockPriceInfo_V2의 행 하나. 값은 모두 문자열 */
export interface StockPriceItem {
  /** 기준일자 'YYYYMMDD' */
  basDt: string;
  /** 단축코드 (예: '005930') */
  srtnCd: string;
  /** ISIN (security.id와 같은 체계) */
  isinCd: string;
  /** 종목명 */
  itmsNm: string;
  /** 시장 구분 (KOSPI, KOSDAQ, KONEX) */
  mrktCtg: string;
  /** 종가 */
  clpr: string;
  /** 시가 */
  mkp: string;
  /** 고가 */
  hipr: string;
  /** 저가 */
  lopr: string;
}

export interface StockPricePage {
  totalCount: number;
  items: StockPriceItem[];
}

export interface StockPriceQuery {
  /** 'YYYYMMDD' 이상 */
  beginBasDt: string;
  /** 'YYYYMMDD' 미만 (이 날짜는 포함되지 않음) */
  endBasDt: string;
  pageNo: number;
  numOfRows: number;
}

/** 정상 응답. 키 오류 등은 `OpenAPI_ServiceResponse` 같은 다른 형태로 옴 */
export interface DataGoKrResponse<T> {
  response?: {
    header: { resultCode: string; resultMsg: string };
    body?: {
      totalCount: number;
      items?: { item?: T | T[] } | '';
    };
  };
}
