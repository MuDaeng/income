/** 배치 잡 한 번의 실행 상태. 프로세스가 죽으면 RUNNING으로 남는다(중단된 실행) */
export enum BatchStatus {
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}
