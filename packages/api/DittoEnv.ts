import type { DittoConf } from '@ditto/conf';
import type { DittoDatabase } from '@ditto/db';
import type { Env } from '@hono/hono';
import type { NRelay } from '@nostrify/nostrify';

export interface DittoEnv extends Env {
  Variables: {
    /** Ditto site configuration. */
    conf: DittoConf;
    /** Main database. */
    store: NRelay;
    /** Database object. */
    db: DittoDatabase;
    /** Abort signal for the request. */
    signal: AbortSignal;
  };
}
