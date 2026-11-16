/** 일별 시세 API(주식·ETF) 공통 행. 값은 모두 문자열 */
export interface PriceItem {
  /** 기준일자 'YYYYMMDD' */
  basDt: string;
  /** 단축코드 (예: '005930') */
  srtnCd: string;
  /** ISIN (security.id와 같은 체계) */
  isinCd: string;
  /** 종목명 */
  itmsNm: string;
  /** 종가 */
  clpr: string;
  /** 시가 */
  mkp: string;
  /** 고가 */
  hipr: string;
  /** 저가 */
  lopr: string;
}

/** 금융위원회 주식시세정보 getStockPriceInfo_V2의 행 하나 */
export interface StockPriceItem extends PriceItem {
  /** 시장 구분 (KOSPI, KOSDAQ, KONEX) */
  mrktCtg: string;
}

/** 금융위원회 증권상품시세정보 getETFPriceInfo_V2의 행 하나 */
export interface EtfPriceItem extends PriceItem {
  /** 순자산가치(NAV) */
  nav?: string;
  /** 기초지수명 */
  bssIdxIdxNm?: string;
}

export interface PricePage<T extends PriceItem = PriceItem> {
  totalCount: number;
  items: T[];
}

export interface PriceQuery {
  /** 'YYYYMMDD' 이상 */
  beginBasDt: string;
  /** 'YYYYMMDD' 미만 (이 날짜는 포함되지 않음) */
  endBasDt: string;
  pageNo: number;
  numOfRows: number;
  /** 있으면 이 ISIN(완전일치) 종목만 */
  isinCd?: string;
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
