import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../auth/restapi/jwt.strategy.js';
import { DividendHistoryCalculator } from '../dividend-history.calculator.js';
import type { DividendHistoryResponse } from './dto/dividend-history.dto.js';
import type { DividendHistoryRequest } from './dto/dividend-history.schema.js';

@Injectable()
export class DividendHistoryService {
  constructor(
    private readonly dividendHistoryCalculator: DividendHistoryCalculator,
  ) {}

  /** 배당금 내역 조회 (계산 규칙은 DividendHistoryCalculator.calculate) */
  getDividendHistory(
    authUser: AuthUser,
    input: DividendHistoryRequest,
  ): Promise<DividendHistoryResponse> {
    return this.dividendHistoryCalculator.calculate(authUser, input);
  }
}
