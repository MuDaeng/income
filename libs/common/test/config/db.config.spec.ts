import awsCaBundle from 'aws-ssl-profiles';
import { dbConfig } from '../../src/config/db.config.js';

describe('dbConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('DB_SSL=true이면 AWS RDS CA 번들로 SSL 접속한다', () => {
    vi.stubEnv('DB_SSL', 'true');

    const config = dbConfig();

    expect(config.ssl).toBe(awsCaBundle);
    expect(config.ssl?.ca.length).toBeGreaterThan(0);
  });

  it.each([[undefined], ['false'], ['']])('DB_SSL=%s이면 ssl 옵션이 없다', (value) => {
    vi.stubEnv('DB_SSL', value);

    expect(dbConfig()).not.toHaveProperty('ssl');
  });
});
