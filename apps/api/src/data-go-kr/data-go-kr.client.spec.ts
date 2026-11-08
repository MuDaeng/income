import { BadGatewayException } from '@nestjs/common';
import { DataGoKrClient } from './data-go-kr.client.js';

const text = (body: string, status = 200) => new Response(body, { status });
const ok = (items: unknown, totalCount = 1) =>
  text(
    JSON.stringify({
      response: {
        header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' },
        body: { numOfRows: 10000, pageNo: 1, totalCount, items },
      },
    }),
  );

const query = {
  beginBasDt: '20261105',
  endBasDt: '20261106',
  pageNo: 2,
  numOfRows: 10000,
};
const samsung = { basDt: '20261105', isinCd: 'KR7005930003', clpr: '72000' };

describe('DataGoKrClient.getStockPrices', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let client: DataGoKrClient;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    client = new DataGoKrClient({
      serviceKey: 'key',
      baseUrl: 'https://apis.data.go.kr',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('서비스 키·기간·페이지를 쿼리로 보내고 item 배열과 totalCount를 돌려준다', async () => {
    fetchMock.mockResolvedValueOnce(ok({ item: [samsung] }, 2876));

    await expect(client.getStockPrices(query)).resolves.toEqual({
      totalCount: 2876,
      items: [samsung],
    });

    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.origin + url.pathname).toBe(
      'https://apis.data.go.kr/1160100/GetStockSecuritiesInfoService_V2/getStockPriceInfo_V2',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      serviceKey: 'key',
      resultType: 'json',
      numOfRows: '10000',
      pageNo: '2',
      beginBasDt: '20261105',
      endBasDt: '20261106',
    });
  });

  it('item이 객체 하나면 배열로 감싸고, items가 빈 문자열이면 빈 배열', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ item: samsung }))
      .mockResolvedValueOnce(ok('', 0));

    await expect(client.getStockPrices(query)).resolves.toEqual({
      totalCount: 1,
      items: [samsung],
    });
    await expect(client.getStockPrices(query)).resolves.toEqual({
      totalCount: 0,
      items: [],
    });
  });

  it.each([
    [
      '등록되지 않은 키(OpenAPI_ServiceResponse)',
      text(
        JSON.stringify({
          OpenAPI_ServiceResponse: {
            cmmMsgHeader: { errMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR' },
          },
        }),
      ),
      'SERVICE_KEY_IS_NOT_REGISTERED_ERROR',
    ],
    [
      'resultCode 오류',
      text(
        JSON.stringify({
          response: { header: { resultCode: '22', resultMsg: 'LIMITED NUMBER' } },
        }),
      ),
      '22 LIMITED NUMBER',
    ],
    ['XML 응답', text('<OpenAPI_ServiceResponse/>'), 'JSON이 아닌 응답'],
    ['HTTP 500', text('oops', 500), '500'],
  ])('%s이면 502', async (_, response, message) => {
    fetchMock.mockResolvedValueOnce(response);

    const error = await client.getStockPrices(query).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as Error).message).toContain(message);
  });
});
