import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { BatchStatus } from './batch-status.enum.js';

/**
 * 배치 잡 실행 이력 (실행 1번 = 1행). pm2 로그는 배포 때 비워지므로 DB에 남긴다.
 * startedAt/finishedAt이 시각을 담으므로 BaseTimeEntity는 쓰지 않는다.
 */
@Entity()
@Index(['name', 'startedAt'])
export class BatchHistory {
  @PrimaryGeneratedColumn()
  id: number;

  /** 잡 이름 (예: us-daily-prices) */
  @Column({ type: 'varchar', length: 50 })
  name: string;

  @Column({ type: 'enum', enum: BatchStatus })
  status: BatchStatus;

  @Column({ type: 'datetime' })
  startedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  finishedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  durationMs: number | null;

  /** 성공: 잡 결과 JSON, 실패: 에러 메시지 */
  @Column({ type: 'text', nullable: true })
  result: string | null;
}
