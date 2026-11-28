import { describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import { UPSERT_CHUNK, upsertInChunks } from '../../src/base/upsert-in-chunks.js';

describe('upsertInChunks', () => {
  it('UPSERT_CHUNK개씩 나눠 같은 conflictPaths로 upsert하고, 비면 호출하지 않는다', async () => {
    const upsert = vi.fn();
    const repository = { upsert } as unknown as Repository<{ id: number }>;
    const rows = Array.from({ length: UPSERT_CHUNK * 2 + 1 }, (_, id) => ({ id }));

    await upsertInChunks(repository, rows, ['id']);
    expect(upsert.mock.calls.map(([chunk]) => (chunk as unknown[]).length)).toEqual([
      UPSERT_CHUNK,
      UPSERT_CHUNK,
      1,
    ]);
    expect(upsert.mock.calls.every(([, paths]) => (paths as string[])[0] === 'id')).toBe(true);

    upsert.mockClear();
    await upsertInChunks(repository, [], ['id']);
    expect(upsert).not.toHaveBeenCalled();
  });
});
