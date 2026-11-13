import { BadGatewayException } from '@nestjs/common';
import { ClientType, type ClientToken } from '@app/common';
import type { Repository } from 'typeorm';
import { KisClient } from './kis.client.js';
import type { KisDividendItem } from './kis.types.js';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const item = (record_date: string): KisDividendItem => ({
  record_date,
  sht_cd: '005930',
  per_sto_divi_amt: '361',
  stk_divi_rate: '0',
  divi_pay_dt: '20260420',
  stk_div_pay_dt: '',
});
const ok = (items: KisDividendItem[]) =>
  json({ rt_cd: '0', msg_cd: 'KIOK0000', msg1: '정상', output1: items });
const tokenResponse = (token: string) =>
  json({ access_token: token, token_type: 'Bearer', expires_in: 86400 });

describe('KisClient', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const findOneBy = vi.fn();
  const save = vi.fn();
  const create = vi.fn((row: Partial<ClientToken>) => row);
  let client: KisClient;

  beforeEach(() => {
    fetchMock.mockReset();
    findOneBy.mockReset();
    save.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    client = new KisClient(
      {
        appKey: 'app-key',
        appSecret: 'app-secret',
        baseUrl: 'https://openapi.koreainvestment.com:9443',
      },
      { findOneBy, save, create } as unknown as Repository<ClientToken>,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const headersOf = (call: number) =>
    fetchMock.mock.calls[call][1]?.headers as Record<string, string>;

  it('저장된 토큰으로 배당일정을 조회하고, 토큰을 새로 발급하지 않는다', async () => {
    findOneBy.mockResolvedValue({ clientType: ClientType.KIS, token: 'stored' });
    fetchMock.mockResolvedValueOnce(ok([item('20251231')]));

    await expect(client.getDividends('005930', '20241109', '20271109')).resolves.toEqual([
      item('20251231'),
    ]);

    expect(findOneBy).toHaveBeenCalledWith({ clientType: ClientType.KIS });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect((url as URL).href).toBe(
      'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/ksdinfo/dividend?CTS=&GB1=0&F_DT=20241109&T_DT=20271109&SHT_CD=005930&HIGH_GB=',
    );
    expect(headersOf(0)).toMatchObject({
      authorization: 'Bearer stored',
      appkey: 'app-key',
      appsecret: 'app-secret',
      tr_id: 'HHKDB669102C0',
      custtype: 'P',
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('저장된 토큰이 없으면 발급해 client_token에 저장한 뒤 조회한다', async () => {
    findOneBy.mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce(tokenResponse('issued')).mockResolvedValueOnce(ok([]));

    await client.getDividends('005930', '20241109', '20271109');

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect((tokenUrl as URL).href).toBe(
      'https://openapi.koreainvestment.com:9443/oauth2/tokenP',
    );
    expect(JSON.parse(tokenInit?.body as string)).toEqual({
      grant_type: 'client_credentials',
      appkey: 'app-key',
      appsecret: 'app-secret',
    });
    expect(save).toHaveBeenCalledWith({ clientType: ClientType.KIS, token: 'issued' });
    expect(headersOf(1).authorization).toBe('Bearer issued');
  });

  it.each([
    ['401', json({ error: 'unauthorized' }, 401)],
    [
      '만료 msg_cd(EGW00123)',
      json({ rt_cd: '1', msg_cd: 'EGW00123', msg1: '기간이 만료된 token 입니다.' }, 500),
    ],
  ])('%s이면 토큰을 재발급·저장하고 한 번 다시 조회한다', async (_, expired) => {
    findOneBy.mockResolvedValue({ clientType: ClientType.KIS, token: 'old' });
    fetchMock
      .mockResolvedValueOnce(expired)
      .mockResolvedValueOnce(tokenResponse('new'))
      .mockResolvedValueOnce(ok([item('20251231')]));

    await expect(client.getDividends('005930', '20241109', '20271109')).resolves.toHaveLength(1);

    expect(save).toHaveBeenCalledWith({ clientType: ClientType.KIS, token: 'new' });
    expect(headersOf(2).authorization).toBe('Bearer new');
  });

  it('새 토큰도 401이면 더 재시도하지 않고 502', async () => {
    findOneBy.mockResolvedValue({ clientType: ClientType.KIS, token: 'old' });
    fetchMock
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(tokenResponse('new'))
      .mockResolvedValueOnce(json({}, 401));

    await expect(client.getDividends('005930', '20241109', '20271109')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('rt_cd가 0이 아니면 502', async () => {
    findOneBy.mockResolvedValue({ clientType: ClientType.KIS, token: 'stored' });
    fetchMock.mockResolvedValueOnce(json({ rt_cd: '1', msg_cd: 'OPSQ0002', msg1: '오류' }));

    await expect(client.getDividends('005930', '20241109', '20271109')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('tr_cont가 M이면 CTS를 넘겨 이어서 조회한다', async () => {
    findOneBy.mockResolvedValue({ clientType: ClientType.KIS, token: 'stored' });
    fetchMock
      .mockResolvedValueOnce(
        json(
          { rt_cd: '0', msg_cd: '', msg1: '', output1: [item('20241231')], CTS: 'NEXT ' },
          200,
          { tr_cont: 'M' },
        ),
      )
      .mockResolvedValueOnce(ok([item('20251231')]));

    await expect(client.getDividends('005930', '20241109', '20271109')).resolves.toHaveLength(2);

    expect((fetchMock.mock.calls[1][0] as URL).searchParams.get('CTS')).toBe('NEXT');
    expect(headersOf(1).tr_cont).toBe('N');
  });
});
