import { Pool, spawn } from '@/deps.ts';

import type { SqliteWorker as _SqliteWorker } from './sqlite.worker.ts';
import type { CompiledQuery, QueryResult } from '@/deps.ts';

class SqliteWorker {
  #pool: Pool<Awaited<ReturnType<typeof spawn<typeof _SqliteWorker>>>>;

  constructor() {
    this.#pool = Pool(
      () =>
        spawn<typeof _SqliteWorker>(
          new Worker(new URL('./sqlite.worker.ts', import.meta.url).href, { type: 'module' }),
        ),
    );
  }

  async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
    return await this.#pool.queue((worker) => worker.executeQuery(query) as Promise<QueryResult<R>>);
  }

  destroy(): Promise<void> {
    return this.#pool.terminate();
  }
}

export default SqliteWorker;
