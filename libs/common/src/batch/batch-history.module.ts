import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BatchHistory } from './batch-history.entity.js';
import { BatchHistoryWriter } from './batch-history.writer.js';

/** 배치 실행 이력(batch_history) 기록. batch 앱이 import하고, api는 조회만 하므로 엔티티만 등록한다 */
@Module({
  imports: [TypeOrmModule.forFeature([BatchHistory])],
  providers: [BatchHistoryWriter],
  exports: [BatchHistoryWriter],
})
export class BatchHistoryModule {}
