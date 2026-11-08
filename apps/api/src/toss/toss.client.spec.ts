import { BadGatewayException } from '@nestjs/common';
import { TossClient } from './toss.client.js';

const config = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  baseUrl: 'https://openapi.tossinvest.com',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('TossClient', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let client: TossClient;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    client = new TossClient(config);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('토큰을 발급해 Bearer로 종목 목록을 호출하고, 두 번째 호출은 토큰을 재사용한다', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({ access_token: 'tok', token_type: 'Bearer', expires_in: 86400 }),
      )
      .mockResolvedValueOnce(json({ result: [{ symbol: '005930' }] }))
      .mockResolvedValueOnce(json({ result: [] }));

    await expect(client.listStocks('KOSPI')).resolves.toEqual([
      { symbol: '005930' },
    ]);
    await client.listStocks('KOSDAQ');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    // TossClient는 URL 객체와 URLSearchParams 본문으로 호출한다
    const urlOf = (call: number) => (fetchMock.mock.calls[call][0] as URL).href;
    const tokenBody = fetchMock.mock.calls[0][1]!.body as URLSearchParams;
    expect(urlOf(0)).toBe('https://openapi.tossinvest.com/oauth2/token');
    expect(tokenBody.toString()).toBe(
      'grant_type=client_credentials&client_id=client-id&client_secret=client-secret',
    );
    expect(urlOf(1)).toBe(
      'https://openapi.tossinvest.com/api/v1/stocks/all?market=KOSPI',
    );
    expect(fetchMock.mock.calls[1][1]?.headers).toEqual({
      Authorization: 'Bearer tok',
    });
    expect(urlOf(2)).toContain('market=KOSDAQ');
  });

  it('만료(1분 전)가 지나면 새로 발급한다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    fetchMock
      .mockResolvedValueOnce(json({ access_token: 'old', expires_in: 120 }))
      .mockResolvedValueOnce(json({ access_token: 'new', expires_in: 120 }));

    await expect(client.getAccessToken()).resolves.toBe('old');
    vi.advanceTimersByTime(59_000);
    await expect(client.getAccessToken()).resolves.toBe('old');
    vi.advanceTimersByTime(2_000);
    await expect(client.getAccessToken()).resolves.toBe('new');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('비정상 응답이면 상태 코드를 담아 502, 403은 허용 IP 안내를 붙인다', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ error: 'access_denied', error_description: 'IP address not allowed' }, 403),
    );

    const error = await client.getAccessToken().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as Error).message).toContain('403');
    expect((error as Error).message).toContain('허용 IP');
    expect((error as Error).message).toContain('IP address not allowed');
  });
});
