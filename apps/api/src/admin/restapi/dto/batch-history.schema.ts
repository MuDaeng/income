import { z } from 'zod';
import { BatchStatus } from '@app/common';

/** 배치 실행 이력 조회 최대 건수 */
export const BATCH_HISTORY_MAX_LIMIT = 100;

export const batchHistorySchema = z.object({
  /** 잡 이름 (예: us-daily-prices). 생략하면 전체 잡 */
  name: z.string().trim().min(1).max(50).optional(),
  /** 실행 상태. 생략하면 전체 */
  status: z.enum(BatchStatus).optional(),
  /** 최근 몇 건 (1~100, 기본 20) */
  limit: z.coerce
    .number()
    .int('정수로 입력하세요.')
    .min(1, '1 이상이어야 합니다.')
    .max(BATCH_HISTORY_MAX_LIMIT, `${BATCH_HISTORY_MAX_LIMIT} 이하여야 합니다.`)
    .default(20),
});

export type BatchHistoryRequest = z.infer<typeof batchHistorySchema>;
