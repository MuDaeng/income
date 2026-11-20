import {
  Currency,
  type Dividend,
  DividendType,
  type KisClient,
  type KisDividendItem,
  type MassiveClient,
  type MassiveDividend,
  type Security,
} from '@app/common';
import type { Repository } from 'typeorm';
import type { DailyPriceReader } from '../../src/security/daily-price.reader.js';
import { DividendFetcher } from '../../src/security/dividend.fetcher.js';

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

describe('DividendFetcher', () => {
  const dividendUpsert = vi.fn();
  const getDividends = vi.fn<KisClient['getDividends']>();
  const getMassiveDividends = vi.fn<MassiveClient['getDividends']>();
  const findKrwTradingDays = vi.fn<DailyPriceReader['findKrwTradingDays']>();
  let service: DividendFetcher;

  beforeEach(() => {
    vi.resetAllMocks();
    getDividends.mockResolvedValue([]);
    getMassiveDividends.mockResolvedValue([]);
    findKrwTradingDays.mockResolvedValue([]);
    service = new DividendFetcher(
      { upsert: dividendUpsert } as unknown as Repository<Dividend>,
      { getDividends } as unknown as KisClient,
      { getDividends: getMassiveDividends } as unknown as MassiveClient,
      { findKrwTradingDays } as unknown as DailyPriceReader,
    );
  });

  it('KRW 종목은 KIS로 기준일 기간을 조회해 현금·주식 배당을 저장하고, 배당락일은 저장된 거래일로 계산한다', async () => {
    // 2025-12-31(수)은 휴장 → 마지막 거래일 12-30, 배당락일 12-29. 2025-06-30(월) → 배당락일 06-27(금)
    findKrwTradingDays.mockResolvedValue([
      '2025-06-20', '2025-06-23', '2025-06-24', '2025-06-25', '2025-06-26', '2025-06-27',
      '2025-06-30', '2025-07-01',
      '2025-12-19', '2025-12-22', '2025-12-23', '2025-12-24', '2025-12-26', '2025-12-29',
      '2025-12-30', '2026-01-02',
    ]);
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
    // 기간 앞 2주부터 거래일을 한 번만 읽는다
    expect(findKrwTradingDays).toHaveBeenCalledTimes(1);
    expect(findKrwTradingDays).toHaveBeenCalledWith('2024-10-26', '2027-11-09');
    expect(getMassiveDividends).not.toHaveBeenCalled();
    expect(dividendUpsert).toHaveBeenCalledWith(
      [
        {
          id: SAMSUNG.id,
          paymentDate: '2026-04-20',
          noticeDate: '2025-12-31',
          exDividendDate: '2025-12-29',
          amount: '361',
          type: DividendType.MONEY,
        },
        {
          id: SAMSUNG.id,
          paymentDate: '2025-08-01',
          noticeDate: '2025-06-30',
          exDividendDate: '2025-06-27',
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
    // 배당이 없으면 거래일도 읽지 않는다
    expect(findKrwTradingDays).not.toHaveBeenCalled();
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
      // 배당락일이 없으면 기준일을 배당락일로
      dividend({
        ex_dividend_date: undefined,
        record_date: '2026-04-15',
        pay_date: '2026-05-01',
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
          exDividendDate: '2026-10-15',
          amount: '0.257812',
          type: DividendType.MONEY,
        },
        expect.objectContaining({
          paymentDate: '2026-08-01',
          noticeDate: '2026-07-15',
          exDividendDate: '2026-07-15',
        }),
        expect.objectContaining({
          paymentDate: '2026-05-01',
          noticeDate: '2026-04-15',
          exDividendDate: '2026-04-15',
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
