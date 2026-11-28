import type {
  ObjectLiteral,
  QueryDeepPartialEntity,
  Repository,
} from 'typeorm';

/** 한 번에 upsert할 최대 행 수 (MySQL placeholder·패킷 한도를 넘지 않도록) */
export const UPSERT_CHUNK = 1_000;

/** rows를 UPSERT_CHUNK개씩 나눠 차례로 upsert한다. 비어 있으면 호출하지 않는다 */
export async function upsertInChunks<T extends ObjectLiteral>(
  repository: Repository<T>,
  rows: QueryDeepPartialEntity<T>[],
  conflictPaths: string[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    await repository.upsert(rows.slice(i, i + UPSERT_CHUNK), conflictPaths);
  }
}
