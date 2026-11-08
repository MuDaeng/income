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

  it('results가 없으면 빈 배열', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ ticker: 'C:USDKRW', status: 'OK', resultsCount: 0 }),
    );

    await expect(
      client.getDailyForexBars('C:USDKRW', '2026-11-07', '2026-11-08'),
    ).resolves.toEqual([]);
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
});
