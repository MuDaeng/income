import { ApiProperty } from '@nestjs/swagger';
import { BatchStatus } from '@app/common';

export class BatchHistoryItemDto {
  @ApiProperty({ description: '실행 이력 id' })
  id: number;

  @ApiProperty({ description: '잡 이름 (예: us-daily-prices)' })
  name: string;

  @ApiProperty({
    enum: BatchStatus,
    description: '실행 상태. RUNNING으로 남아 있으면 실행 중이거나 프로세스가 중간에 죽은 것',
  })
  status: BatchStatus;

  @ApiProperty({ description: '시작 시각' })
  startedAt: Date;

  @ApiProperty({ type: Date, nullable: true, description: '종료 시각 (실행 중이면 null)' })
  finishedAt: Date | null;

  @ApiProperty({ type: Number, nullable: true, description: '실행 시간(ms)' })
  durationMs: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '성공: 잡 결과 JSON, 실패: 에러 메시지 (최대 10,000자)',
  })
  result: string | null;
}
