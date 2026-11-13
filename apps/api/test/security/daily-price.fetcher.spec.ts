import {
  Currency,
  type DailySecurity,
  type Security,
  SecurityType,
} from '@app/common';
import type { DataGoKrClient } from '@app/core';
import type { Repository } from 'typeorm';
import { DailyPriceFetcher } from '../../src/security/daily-price.fetcher.js';

const SAMSUNG = {
  id: 'KR7005930003',
  symbol: '005930',
  type: SecurityType.STOCK,
  currency: Currency.KRW,
} as Security;
const KODEX = {
  id: 'KR7476800008',
  symbol: '476800',
  type: SecurityType.ETF,
  currency: Currency.KRW,
} as Security;
const BAC_P = {
  id: 'US0605056821',
  symbol: 'BAC-P',
  type: SecurityType.FOREIGN_STOCK,
  currency: Currency.USD,
} as Security;

const priceItem = (isinCd: string, basDt: string) => ({
  basDt,
  srtnCd: '',
  isinCd,
  itmsNm: '',
  mkp: '71000',
  clpr: '72000.5',
  hipr: '72500',
  lopr: ' ',
});

describe('DailyPriceFetcher.fetchAndSave', () => {
  const upsert = vi.fn();
  const getStockPrices = vi.fn<DataGoKrClient['getStockPrices']>();
  const getEtfPrices = vi.fn<DataGoKrClient['getEtfPrices']>();
  let fetcher: DailyPriceFetcher;

  beforeEach(() => {
    vi.resetAllMocks();
    getStockPrices.mockResolvedValue({ totalCount: 0, items: [] });
    getEtfPrices.mockResolvedValue({ totalCount: 0, items: [] });
    fetcher = new DailyPriceFetcher(
      { upsert } as unknown as Repository<DailySecurity>,
      { getStockPrices, getEtfPrices } as unknown as DataGoKrClient,
    );
  });

  it('KRW 주식은 주식시세를 ISIN으로 조회해 원화 정수로 저장한다 (끝 날짜 포함)', async () => {
    getStockPrices.mockResolvedValue({
      totalCount: 2,
      items: [
        priceItem(SAMSUNG.id, '20261105'),
        // 다른 종목이 섞여 와도 저장하지 않음
        priceItem('KR7000660001', '20261105'),
      ],
    });

    await expect(
      fetcher.fetchAndSave(SAMSUNG, '2024-11-09', '2026-11-09'),
    ).resolves.toBe(1);

    expect(getStockPrices).toHaveBeenCalledWith({
      beginBasDt: '20241109',
      endBasDt: '20261110',
      pageNo: 1,
      numOfRows: 10000,
      isinCd: SAMSUNG.id,
    });
    expect(getEtfPrices).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(
      [
        {
          id: SAMSUNG.id,
          date: '2026-11-05',
          openingPrice: '71000',
          closingPrice: '72000',
          highestPrice: '72500',
          lowestPrice: '0',
        },
      ],
      ['id', 'date'],
    );
  });

  it('KRW ETF는 증권상품시세(ETF)로 조회한다', async () => {
    await fetcher.fetchAndSave(KODEX, '2024-11-09', '2026-11-09');

    expect(getEtfPrices).toHaveBeenCalledWith(
      expect.objectContaining({ isinCd: KODEX.id }),
    );
    expect(getStockPrices).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('USD는 batch가 시세를 받으므로 조회하지 않는다', async () => {
    await expect(
      fetcher.fetchAndSave(BAC_P, '2024-11-09', '2026-11-09'),
    ).resolves.toBe(0);

    expect(getStockPrices).not.toHaveBeenCalled();
    expect(getEtfPrices).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});
