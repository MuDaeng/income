import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { dataGoKrConfig } from '@app/common';
import type {
  DataGoKrResponse,
  StockPriceItem,
  StockPricePage,
  StockPriceQuery,
} from './data-go-kr.types.js';

/** 10,000행 페이지는 수 MB라 여유 있게 */
const TIMEOUT_MS = 60_000;
const STOCK_PRICE_PATH =
  '/1160100/GetStockSecuritiesInfoService_V2/getStockPriceInfo_V2';

/** 공공데이터포털(data.go.kr) Open API 호출 */
@Injectable()
export class DataGoKrClient {
  constructor(
    @Inject(dataGoKrConfig.KEY)
    private readonly dataGoKr: ConfigType<typeof dataGoKrConfig>,
  ) {}

  /** 금융위원회 주식시세정보 (국내 상장 주식 일별 시세) 한 페이지 */
  async getStockPrices(query: StockPriceQuery): Promise<StockPricePage> {
    const url = new URL(STOCK_PRICE_PATH, this.dataGoKr.baseUrl);
    url.search = new URLSearchParams({
      serviceKey: this.dataGoKr.serviceKey ?? '',
      resultType: 'json',
      numOfRows: String(query.numOfRows),
      pageNo: String(query.pageNo),
      beginBasDt: query.beginBasDt,
      endBasDt: query.endBasDt,
    }).toString();

    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await response.text();
    const fail = (reason: string) =>
      new BadGatewayException(
        `data.go.kr 주식시세 조회 실패: ${reason} ${text.slice(0, 300)}`.trim(),
      );
    if (!response.ok) {
      throw fail(String(response.status));
    }

    let body: DataGoKrResponse<StockPriceItem>;
    try {
      body = JSON.parse(text) as DataGoKrResponse<StockPriceItem>;
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
