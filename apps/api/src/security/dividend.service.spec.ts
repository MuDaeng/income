import {
  Currency,
  type Dividend,
  DividendType,
  type Security,
  type SecuritySearch,
} from '@app/common';
import type { Repository } from 'typeorm';
import type {
  KisClient,
  KisDividendItem,
  MassiveClient,
  MassiveDividend,
} from '@app/core';
import { DividendService } from './dividend.service.js';

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

describe('DividendService.refreshDividends', () => {
  const dividendUpsert = vi.fn();
  const searchFindOneBy = vi.fn();
  const searchUpsert = vi.fn();
  const getDividends = vi.fn<KisClient['getDividends']>();
  const getMassiveDividends = vi.fn<MassiveClient['getDividends']>();
  let service: DividendService;

  beforeEach(() => {
    vi.resetAllMocks();
    // 2026-11-09 00:30 KST (UTC로는 11-08)
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-08T15:30:00Z'));
    getDividends.mockResolvedValue([]);
    getMassiveDividends.mockResolvedValue([]);
    service = new DividendService(
      { upsert: dividendUpsert } as unknown as Repository<Dividend>,
      {
        findOneBy: searchFindOneBy,
        upsert: searchUpsert,
      } as unknown as Repository<SecuritySearch>,
      { getDividends } as unknown as KisClient,
      { getDividends: getMassiveDividends } as unknown as MassiveClient,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('오늘(한국 시간) 이미 조회했으면 KIS를 호출하지 않고 저장도 하지 않는다', async () => {
    searchFindOneBy.mockResolvedValue({ id: SAMSUNG.id, lastSearchDate: '2026-11-09' });

    await service.refreshDividends(SAMSUNG);

    expect(searchFindOneBy).toHaveBeenCalledWith({ id: SAMSUNG.id });
    expect(getDividends).not.toHaveBeenCalled();
    expect(dividendUpsert).not.toHaveBeenCalled();
    expect(searchUpsert).not.toHaveBeenCalled();
  });

  it.each([
    ['조회 기록이 없으면', null],
    ['마지막 조회가 어제면', { id: SAMSUNG.id, lastSearchDate: '2026-11-08' }],
  ])('%s KIS로 조회해 현금·주식 배당을 저장하고 lastSearchDate를 오늘로 둔다', async (_, search) => {
    searchFindOneBy.mockResolvedValue(search);
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

    await service.refreshDividends(SAMSUNG);

    expect(getDividends).toHaveBeenCalledWith('005930', '20241109', '20271109');
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
    expect(searchUpsert).toHaveBeenCalledWith(
      { id: SAMSUNG.id, lastSearchDate: '2026-11-09' },
      ['id'],
    );
  });

  it('배당이 없어도 lastSearchDate는 갱신한다', async () => {
    searchFindOneBy.mockResolvedValue(null);

    await service.refreshDividends(SAMSUNG);

    expect(dividendUpsert).not.toHaveBeenCalled();
    expect(searchUpsert).toHaveBeenCalledTimes(1);
  });

  it('USD 종목은 symbol을 Massive 티커로 바꿔 배당락일 기간으로 조회하고 6자리 버림으로 저장한다', async () => {
    const preferred = {
      id: 'US0605056821',
      symbol: 'BAC-P',
      currency: Currency.USD,
    } as Security;
    searchFindOneBy.mockResolvedValue({ id: preferred.id, lastSearchDate: '2026-11-08' });
    const dividend = (overrides: Partial<MassiveDividend>): MassiveDividend => ({
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
      dividend({ record_date: undefined, ex_dividend_date: '2026-07-15', pay_date: '2026-08-01' }),
      // 지급일 미정 → 건너뜀
      dividend({ pay_date: undefined }),
    ]);

    await service.refreshDividends(preferred);

    expect(getDividends).not.toHaveBeenCalled();
    expect(getMassiveDividends).toHaveBeenCalledWith('BACpP', '2024-11-09', '2027-11-09');
    expect(dividendUpsert).toHaveBeenCalledWith(
      [
        {
          id: preferred.id,
          paymentDate: '2026-11-02',
          noticeDate: '2026-10-15',
          amount: '0.257812',
          type: DividendType.MONEY,
        },
        expect.objectContaining({ paymentDate: '2026-08-01', noticeDate: '2026-07-15' }),
      ],
      ['id', 'paymentDate'],
    );
    expect(searchUpsert).toHaveBeenCalledWith(
      { id: preferred.id, lastSearchDate: '2026-11-09' },
      ['id'],
    );
  });

  it('USD 종목도 오늘 이미 조회했으면 Massive를 호출하지 않는다', async () => {
    searchFindOneBy.mockResolvedValue({ id: 'US0378331005', lastSearchDate: '2026-11-09' });

    await service.refreshDividends({
      id: 'US0378331005',
      symbol: 'AAPL',
      currency: Currency.USD,
    } as Security);

    expect(getMassiveDividends).not.toHaveBeenCalled();
    expect(dividendUpsert).not.toHaveBeenCalled();
  });

  it('KRW 종목은 Massive를 호출하지 않는다', async () => {
    searchFindOneBy.mockResolvedValue(null);

    await service.refreshDividends(SAMSUNG);

    expect(getDividends).toHaveBeenCalledTimes(1);
    expect(getMassiveDividends).not.toHaveBeenCalled();
  });
});
