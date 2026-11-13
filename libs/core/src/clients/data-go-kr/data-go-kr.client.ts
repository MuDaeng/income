import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { dataGoKrConfig } from '@app/common';
import type {
  DataGoKrResponse,
  EtfPriceItem,
  PriceItem,
  PricePage,
  PriceQuery,
  StockPriceItem,
} from './data-go-kr.types.js';

/** 10,000행 페이지는 수 MB라 여유 있게 */
const TIMEOUT_MS = 60_000;
const STOCK_PRICE_PATH =
  '/1160100/GetStockSecuritiesInfoService_V2/getStockPriceInfo_V2';
const ETF_PRICE_PATH =
  '/1160100/GetSecuritiesProductInfoService_V2/getETFPriceInfo_V2';

/** 공공데이터포털(data.go.kr) Open API 호출 */
@Injectable()
export class DataGoKrClient {
  constructor(
    @Inject(dataGoKrConfig.KEY)
    private readonly dataGoKr: ConfigType<typeof dataGoKrConfig>,
  ) {}

  /** 금융위원회 주식시세정보 (국내 상장 주식 일별 시세) 한 페이지 */
  getStockPrices(query: PriceQuery): Promise<PricePage<StockPriceItem>> {
    return this.getPricePage<StockPriceItem>(STOCK_PRICE_PATH, '주식시세', query);
  }

  /**
   * 금융위원회 증권상품시세정보 ETF 시세 (국내 상장 ETF 일별 시세) 한 페이지.
   * 공공데이터포털에서 '증권상품시세정보' 활용신청이 따로 돼 있어야 한다 (안 되면 등록되지 않은 서비스키 → 502)
   */
  getEtfPrices(query: PriceQuery): Promise<PricePage<EtfPriceItem>> {
    return this.getPricePage<EtfPriceItem>(ETF_PRICE_PATH, 'ETF 시세', query);
  }

  /** 일별 시세 API 공통: 같은 쿼리·응답 형식 */
  private async getPricePage<T extends PriceItem>(
    path: string,
    what: string,
    query: PriceQuery,
  ): Promise<PricePage<T>> {
    const url = new URL(path, this.dataGoKr.baseUrl);
    url.search = new URLSearchParams({
      serviceKey: this.dataGoKr.serviceKey ?? '',
      resultType: 'json',
      numOfRows: String(query.numOfRows),
      pageNo: String(query.pageNo),
      beginBasDt: query.beginBasDt,
      endBasDt: query.endBasDt,
      ...(query.isinCd ? { isinCd: query.isinCd } : {}),
    }).toString();

    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await response.text();
    const fail = (reason: string) =>
      new BadGatewayException(
        `data.go.kr ${what} 조회 실패: ${reason} ${text.slice(0, 300)}`.trim(),
      );
    if (!response.ok) {
      throw fail(String(response.status));
    }

    let body: DataGoKrResponse<T>;
    try {
      body = JSON.parse(text) as DataGoKrResponse<T>;
    } catch {
      // 키 오류 등은 XML로 오기도 함
      throw fail('JSON이 아닌 응답');
    }
    // 키 오류는 `OpenAPI_ServiceResponse` 형태로 와서 response가 없음
    const header = body.response?.header;
    if (header?.resultCode !== '00') {
      throw fail(header ? `${header.resultCode} ${header.resultMsg}` : '오류 응답');
    }

    const result = body.response?.body;
    const item = result?.items ? result.items.item : undefined;
    return {
      totalCount: Number(result?.totalCount ?? 0),
      items: item === undefined ? [] : Array.isArray(item) ? item : [item],
    };
  }
}
