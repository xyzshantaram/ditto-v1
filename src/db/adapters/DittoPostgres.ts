import { Kysely, PostgresDialect } from 'kysely';
import * as pg from "node-pg";
import { Conf } from '@/config.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { KyselyLogger } from '@/db/KyselyLogger.ts';
export class DittoPostgres {
  static db: Kysely<DittoTables> | undefined;

  // deno-lint-ignore require-await
  static async getInstance(): Promise<Kysely<DittoTables>> {
    if (!this.db) {
      this.db = new Kysely({
        dialect: new PostgresDialect({
          pool: new pg.default.Pool({
            connectionString: Conf.databaseUrl
          })
        }),
        log: KyselyLogger,
      });
    }

    return this.db;
  }
}
