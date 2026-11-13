import {
  Currency,
  type Dividend,
  DividendType,
  type Security,
} from '@app/common';
import type { Repository } from 'typeorm';
import type {
  KisClient,
  KisDividendItem,
  MassiveClient,
  MassiveDividend,
} from '@app/core';
import { DividendService } from '../../src/security/dividend.service.js';

const SAMSUNG = {
  id: 'KR7005930003',
  symbol: '005930',
  currency: Currency.KRW,
} as Security;

const item = (overrides: Partial<KisDividendItem>): KisDividendItem => ({
  record_date: '20251231',
  sht_cd: '005930',
  per_sto_divi_amt: '0',
  stk_divi_rate: '0',
  divi_pay_dt: '',
  stk_div_pay_dt: '',
  ...overrides,
});

describe('DividendService.fetchAndSave', () => {
  const dividendUpsert = vi.fn();
  const getDividends = vi.fn<KisClient['getDividends']>();
  const getMassiveDividends = vi.fn<MassiveClient['getDividends']>();
  let service: DividendService;

  beforeEach(() => {
    vi.resetAllMocks();
    getDividends.mockResolvedValue([]);
    getMassiveDividends.mockResolvedValue([]);
    service = new DividendService(
      { upsert: dividendUpsert } as unknown as Repository<Dividend>,
      { getDividends } as unknown as KisClient,
      { getDividends: getMassiveDividends } as unknown as MassiveClient,
    );
  });

  it('KRW 종목은 KIS로 기준일 기간을 조회해 현금·주식 배당을 저장한다', async () => {
    getDividends.mockResolvedValue([
      // 실제 응답처럼 지급일은 'YYYY/MM/DD'
      item({ per_sto_divi_amt: '361.9', divi_pay_dt: '2026/04/20' }),
      item({
        record_date: '20250630',
        stk_divi_rate: '2.5',
        stk_div_pay_dt: '20250801',
      }),
      // 지급일 미정 → 건너뜀
      item({ record_date: '20260930', per_sto_divi_amt: '370' }),
    ]);

    await expect(
      service.fetchAndSave(SAMSUNG, '2024-11-09', '2027-11-09'),
    ).resolves.toEqual({ fetched: 3, saved: 2 });

    expect(getDividends).toHaveBeenCalledWith('005930', '20241109', '20271109');
    expect(getMassiveDividends).not.toHaveBeenCalled();
    expect(dividendUpsert).toHaveBeenCalledWith(
      [
        {
          id: SAMSUNG.id,
          paymentDate: '2026-04-20',
          noticeDate: '2025-12-31',
          amount: '361',
          type: DividendType.MONEY,
        },
        {
          id: SAMSUNG.id,
          paymentDate: '2025-08-01',
          noticeDate: '2025-06-30',
          amount: '2.500000',
          type: DividendType.STOCK,
        },
      ],
      ['id', 'paymentDate'],
    );
  });

  it('배당이 없으면 저장하지 않는다', async () => {
    await expect(
      service.fetchAndSave(SAMSUNG, '2024-11-09', '2027-11-09'),
    ).resolves.toEqual({ fetched: 0, saved: 0 });
    expect(dividendUpsert).not.toHaveBeenCalled();
  });

  it('USD 종목은 symbol을 Massive 티커로 바꿔 배당락일 기간으로 조회하고 6자리 버림으로 저장한다', async () => {
    const preferred = {
      id: 'US0605056821',
      symbol: 'BAC-P',
      currency: Currency.USD,
    } as Security;
    const dividend = (
      overrides: Partial<MassiveDividend>,
    ): MassiveDividend => ({
      id: 'E1',
      ticker: 'BACpP',
      cash_amount: 0.2578125,
      currency: 'USD',
      record_date: '2026-10-15',
      ex_dividend_date: '2026-10-15',
      pay_date: '2026-11-02',
      ...overrides,
    });
    getMassiveDividends.mockResolvedValue([
      dividend({}),
      // 기준일이 없으면 배당락일을 noticeDate로
      dividend({
        record_date: undefined,
        ex_dividend_date: '2026-07-15',
        pay_date: '2026-08-01',
      }),
      // 지급일 미정 → 건너뜀
      dividend({ pay_date: undefined }),
    ]);

    await service.fetchAndSave(preferred, '2024-11-09', '2027-11-09');

    expect(getDividends).not.toHaveBeenCalled();
    expect(getMassiveDividends).toHaveBeenCalledWith(
      'BACpP',
      '2024-11-09',
      '2027-11-09',
    );
    expect(dividendUpsert).toHaveBeenCalledWith(
      [
        {
          id: preferred.id,
          paymentDate: '2026-11-02',
          noticeDate: '2026-10-15',
          amount: '0.257812',
          type: DividendType.MONEY,
        },
        expect.objectContaining({
          paymentDate: '2026-08-01',
          noticeDate: '2026-07-15',
        }),
      ],
      ['id', 'paymentDate'],
    );
  });

  it('KRW·USD 외 통화는 조회하지 않는다', async () => {
    await expect(
      service.fetchAndSave(
        { id: 'JP3633400001', symbol: '7203', currency: 'JPY' } as unknown as Security,
        '2024-11-09',
        '2027-11-09',
      ),
    ).resolves.toEqual({ fetched: 0, saved: 0 });
    expect(getDividends).not.toHaveBeenCalled();
    expect(getMassiveDividends).not.toHaveBeenCalled();
  });
});
