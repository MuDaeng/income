import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { initializeTransactionalContext } from 'typeorm-transactional';
import {
  BATCH_JOB_NAMES,
  BATCH_TIME_ZONE,
  BatchJobs,
  type BatchJobName,
} from './batch.jobs.js';
import { BatchModule } from './batch.module.js';

/**
 * 일배치 앱. 기본은 상주하면서 @Cron 일정대로 실행한다.
 * `--run=<exchange-rates|domestic-securities|overseas-securities|us-daily-prices|expired-tokens>`를 주면 그 잡만 한 번 실행하고 종료한다
 * (수동 재실행·확인용, 실패하면 종료 코드 1).
 */
async function bootstrap() {
  // DatabaseModule이 typeorm-transactional DataSource를 등록하므로 앱 생성 전에 호출
  initializeTransactionalContext();
  const runArg = process.argv.find((arg) => arg.startsWith('--run='));
  const app = await NestFactory.createApplicationContext(BatchModule);
  app.enableShutdownHooks();

  if (!runArg) {
    // 등록된 잡과 다음 실행 시각(KST)을 남겨 스케줄이 걸렸는지 확인할 수 있게 한다
    for (const [name, job] of app.get(SchedulerRegistry).getCronJobs()) {
      Logger.log(
        `${name}: 다음 실행 ${job.nextDate().setZone(BATCH_TIME_ZONE).toFormat('yyyy-MM-dd HH:mm')}`,
        'Batch',
      );
    }
    return;
  }

  const name = runArg.slice('--run='.length);
  if (!(BATCH_JOB_NAMES as readonly string[]).includes(name)) {
    Logger.error(
      `알 수 없는 잡: ${name} (가능: ${BATCH_JOB_NAMES.join(', ')})`,
      'Batch',
    );
    await app.close();
    process.exit(1);
  }
  // ScheduleModule은 스케줄만 등록하므로, 한 번 실행 모드에서는 일정이 오기 전에 닫힌다
  const ok = await app.get(BatchJobs).runByName(name as BatchJobName);
  await app.close();
  process.exit(ok ? 0 : 1);
}
await bootstrap();
