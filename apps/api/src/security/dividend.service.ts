import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { Repository } from 'typeorm';
import { Dividend, DividendType, Security, truncateByCurrency } from '@app/common';
import type { MonthlyDividendResponse } from './monthly-dividend.dto.js';
import type { MonthlyDividendRequest } from './monthly-dividend.schema.js';
import { SecurityRefreshService } from './security-refresh.service.js';

/** 저장된 배당을 읽어 조회 API 응답을 만든다. 원천에서 받아 저장하는 일은 DividendSaveService가 한다 */
@Injectable()
export class DividendService {
  constructor(
    @InjectRepository(Dividend)
    private readonly dividendRepository: Repository<Dividend>,
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    private readonly securityRefreshService: SecurityRefreshService,
  ) {}

  /**
   * 종목 월별 배당금 조회(로그인 불필요). 현금배당(MONEY)의 1주당 금액을 지급월(paymentDate)별로 합산해
   * 월 오름차순으로 돌려준다. 종목이 없으면 404.
   * 읽기 전에 그 종목을 온라인으로 갱신한다(종목별 하루 한 번, 실패해도 저장분으로 응답).
   */
  async getMonthlyDividends(
    input: MonthlyDividendRequest,
  ): Promise<MonthlyDividendResponse> {
    const found = await this.securityRepository.findOneBy({
      id: input.securityId,
    });
    if (!found) {
      throw new NotFoundException('종목을 찾을 수 없습니다.');
    }
    await this.securityRefreshService.refresh(found);
    const { id, symbol, name, currency } = found;

    const rows = await this.dividendRepository.find({
      where: { id, type: DividendType.MONEY },
      order: { paymentDate: 'ASC' },
    });

    const byMonth = new Map<string, { sum: Decimal; count: number }>();
    for (const row of rows) {
      const month = row.paymentDate.slice(0, 7);
      const entry = byMonth.get(month) ?? { sum: new Decimal(0), count: 0 };
      // 행마다 통화별로 버린 뒤 더한다(다른 배당 합계와 같은 규칙)
      entry.sum = entry.sum.plus(truncateByCurrency(row.amount, currency));
      entry.count += 1;
      byMonth.set(month, entry);
    }

    return {
      security: { id, symbol, name, currency },
      months: [...byMonth.entries()].map(([month, { sum, count }]) => ({
        month,
        amount: truncateByCurrency(sum, currency),
        count,
      })),
    };
  }
}
