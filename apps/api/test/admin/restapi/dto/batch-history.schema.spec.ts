import { BatchStatus } from '@app/common';
import { batchHistorySchema } from '../../../../src/admin/restapi/dto/batch-history.schema.js';

describe('batchHistorySchema', () => {
  it('아무것도 없으면 limit 20', () => {
    expect(batchHistorySchema.parse({})).toEqual({ limit: 20 });
  });

  it('쿼리 문자열 limit을 숫자로 바꾸고 name·status를 받는다', () => {
    expect(
      batchHistorySchema.parse({
        name: ' us-daily-prices ',
        status: 'FAILED',
        limit: '5',
      }),
    ).toEqual({ name: 'us-daily-prices', status: BatchStatus.FAILED, limit: 5 });
  });

  it('limit 범위(1~100)·정수가 아니거나 모르는 상태면 실패', () => {
    for (const query of [
      { limit: '0' },
      { limit: '101' },
      { limit: '1.5' },
      { limit: 'abc' },
      { status: 'DONE' },
    ]) {
      expect(batchHistorySchema.safeParse(query).success).toBe(false);
    }
  });
});
