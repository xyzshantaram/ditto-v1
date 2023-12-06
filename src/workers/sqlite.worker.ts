/// <reference lib="webworker" />

import { Conf } from '@/config.ts';
import { type CompiledQuery, DenoSqlite3, expose, type QueryResult } from '@/deps.ts';

const db: DenoSqlite3 = new DenoSqlite3(Conf.dbPath);

db.exec(`
PRAGMA synchronous = normal;
PRAGMA temp_store = memory;
PRAGMA mmap_size = ${Conf.sqlite.mmapSize};
`);

export const SqliteWorker = {
  executeQuery<R>({ sql, parameters }: CompiledQuery): QueryResult<R> {
    if (!db) throw new Error('Database not open');
    return {
      rows: db.prepare(sql).all(...parameters as any[]) as R[],
      numAffectedRows: BigInt(db.changes),
      insertId: BigInt(db.lastInsertRowId),
    };
  },
  destroy() {
    db?.close();
  },
};

expose(SqliteWorker);
