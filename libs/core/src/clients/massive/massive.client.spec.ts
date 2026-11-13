import { BadGatewayException } from '@nestjs/common';
import { MassiveClient } from './massive.client.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('MassiveClient', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let client: MassiveClient;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    client = new MassiveClient({
      apiKey: 'key',
      baseUrl: 'https://api.massive.com',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('일봉 경로·쿼리와 Bearer 키로 호출하고 results를 돌려준다', async () => {
    const bar = { o: 1380, h: 1390, l: 1370, c: 1385.5, t: 1762560000000 };
    fetchMock.mockResolvedValueOnce(
      json({ ticker: 'C:USDKRW', status: 'OK', results: [bar] }),
    );

    await expect(
      client.getDailyForexBars('C:USDKRW', '2024-11-08', '2026-11-08'),
    ).resolves.toEqual([bar]);

    const [url, init] = fetchMock.mock.calls[0];
    expect((url as URL).href).toBe(
      'https://api.massive.com/v2/aggs/ticker/C%3AUSDKRW/range/1/day/2024-11-08/2026-11-08?adjusted=true&sort=asc&limit=50000',
    );
    expect(init?.headers).toEqual({ Authorization: 'Bearer key' });
  });

  it('미국 주식 한 종목 일봉도 같은 Aggregates 경로로 호출한다', async () => {
    const bar = { o: 1, h: 2, l: 0.5, c: 1.5, t: 1762318800000 };
    fetchMock.mockResolvedValueOnce(json({ status: 'OK', results: [bar] }));

    await expect(
      client.getDailyStockBars('BACpP', '2026-11-01', '2026-11-05'),
    ).resolves.toEqual([bar]);
    expect((fetchMock.mock.calls[0][0] as URL).href).toBe(
      'https://api.massive.com/v2/aggs/ticker/BACpP/range/1/day/2026-11-01/2026-11-05?adjusted=true&sort=asc&limit=50000',
    );
  });

  it('results가 없으면 빈 배열', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ ticker: 'C:USDKRW', status: 'OK', resultsCount: 0 }),
    );

    await expect(
      client.getDailyForexBars('C:USDKRW', '2026-11-07', '2026-11-08'),
    ).resolves.toEqual([]);
  });

  it('미국 주식 grouped daily를 날짜 경로로 호출하고, 휴장일(results 없음)은 빈 배열', async () => {
    const bar = { T: 'AAPL', o: 1, h: 2, l: 0.5, c: 1.5, t: 0 };
    fetchMock
      .mockResolvedValueOnce(json({ status: 'OK', resultsCount: 1, results: [bar] }))
      .mockResolvedValueOnce(json({ status: 'OK', resultsCount: 0 }));

    await expect(client.getGroupedDailyStocks('2026-11-05')).resolves.toEqual([bar]);
    await expect(client.getGroupedDailyStocks('2026-11-26')).resolves.toEqual([]);
    expect((fetchMock.mock.calls[0][0] as URL).href).toBe(
      'https://api.massive.com/v2/aggs/grouped/locale/us/market/stocks/2026-11-05?adjusted=true',
    );
  });

  it('429면 Retry-After(없으면 15초)만큼 기다렸다 다시 시도한다', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(
        new Response('too many', { status: 429, headers: { 'Retry-After': '2' } }),
      )
      .mockResolvedValueOnce(new Response('too many', { status: 429 }))
      .mockResolvedValueOnce(json({ status: 'OK', results: [] }));

    const promise = client.getGroupedDailyStocks('2026-11-05');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(promise).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('비정상 응답이면 상태 코드와 본문을 담아 502', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ status: 'ERROR', error: 'Unknown API Key' }, 401),
    );

    const error = await client
      .getDailyForexBars('C:USDKRW', '2026-11-07', '2026-11-08')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as Error).message).toContain('401');
    expect((error as Error).message).toContain('Unknown API Key');
  });

  it('배당은 티커·배당락일 기간·limit으로 조회하고 next_url을 따라 이어 받는다', async () => {
    const first = { id: 'E1', ticker: 'AAPL', cash_amount: 0.26, currency: 'USD', pay_date: '2026-05-14' };
    const second = { id: 'E2', ticker: 'AAPL', cash_amount: 0.27, currency: 'USD', pay_date: '2026-08-13' };
    fetchMock
      .mockResolvedValueOnce(
        json({ status: 'OK', results: [first], next_url: 'https://api.massive.com/stocks/v1/dividends?cursor=abc' }),
      )
      .mockResolvedValueOnce(json({ status: 'OK', results: [second] }));

    await expect(client.getDividends('AAPL', '2024-11-09', '2027-11-09')).resolves.toEqual([
      first,
      second,
    ]);

    const [url, init] = fetchMock.mock.calls[0];
    expect((url as URL).href).toBe(
      'https://api.massive.com/stocks/v1/dividends?ticker=AAPL&ex_dividend_date.gte=2024-11-09&ex_dividend_date.lte=2027-11-09&limit=5000&sort=ex_dividend_date.asc',
    );
    expect(init?.headers).toEqual({ Authorization: 'Bearer key' });
    expect((fetchMock.mock.calls[1][0] as URL).href).toBe(
      'https://api.massive.com/stocks/v1/dividends?cursor=abc',
    );
  });
});
