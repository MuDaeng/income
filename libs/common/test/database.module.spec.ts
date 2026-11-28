import {
  getDataSourceByName,
  initializeTransactionalContext,
} from 'typeorm-transactional';
import { registerTransactionalDataSource } from '../src/database.module.js';

describe('registerTransactionalDataSource', () => {
  // 등록된 DataSource는 manager가 트랜잭션 컨텍스트를 읽도록 패치된다 (main.ts처럼 먼저 초기화)
  beforeAll(() => {
    initializeTransactionalContext();
  });

  it('연결 재시도로 다시 불려도 throw하지 않고 새 DataSource로 바꿔 등록한다', () => {
    const options = { type: 'mysql' as const, host: '127.0.0.1' };

    const first = registerTransactionalDataSource(options);
    const second = registerTransactionalDataSource(options);

    expect(second).not.toBe(first);
    expect(getDataSourceByName('default')).toBe(second);
  });
});
