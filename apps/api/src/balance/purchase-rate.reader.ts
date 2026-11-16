import { Injectable, NotFoundException } from '@nestjs/common';
import type { DailyExchangeRate, PurchaseDateBalance } from '@app/common';
import { ExchangeRateReader } from '../security/exchange-rate.reader.js';

/** USD 매수분의 구매 환율(KRW per USD) */
@Injectable()
export class PurchaseRateReader {
  constructor(private readonly exchangeRateReader: ExchangeRateReader) {}

  /**
   * 저장된 구매 환율, 없으면 매수일(포함) 이전 가장 최근 USD 환율. 둘 다 없으면 404.
   * cache는 매수일별 환율 캐시(한 요청 안에서 같은 날짜를 한 번만 조회)
   */
  async getRate(
    purchase: PurchaseDateBalance,
    cache: Map<string, DailyExchangeRate | null>,
  ): Promise<string> {
    if (purchase.exchangeRate != null) {
      return purchase.exchangeRate;
    }
    const rate = await this.exchangeRateReader.findUsdOnOrBefore(
      purchase.purchaseDate,
      cache,
    );
    if (!rate) {
      throw new NotFoundException(
        `${purchase.purchaseDate} 이전의 USD 환율 정보가 없습니다.`,
      );
    }
    return rate.closingRate;
  }
}
