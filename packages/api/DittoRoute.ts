import { type Env, Hono } from '@hono/hono';

import type { DittoConf } from '@ditto/conf';
import type { DittoDatabase, DittoTables } from '@ditto/db';
import type { HonoOptions } from '@hono/hono/hono-base';
import type { NostrSigner, NPool, NRelay, NStore, NUploader } from '@nostrify/nostrify';
import type { Kysely } from 'kysely';

interface DittoEnv extends Env {
  Variables: {
    conf: DittoConf;
    user?: {
      /** Signer to get the logged-in user's pubkey, relays, and to sign events, or `undefined` if the user isn't logged in. */
      signer: NostrSigner;
      /** Storage for the user, might filter out unwanted content. */
      store: NStore;
    };
    /** Uploader for the user to upload files. */
    uploader?: NUploader;
    /** Kysely instance for the database. */
    kysely: Kysely<DittoTables>;
    /** Main database. */
    store: NRelay;
    /** Internal Nostr relay for realtime subscriptions. */
    pubsub: NRelay;
    /** Nostr relay pool. */
    pool: NPool<NRelay>;
    /** Database object. */
    db: DittoDatabase;
    /** Normalized pagination params. */
    pagination: { since?: number; until?: number; limit: number };
    /** Normalized list pagination params. */
    listPagination: { offset: number; limit: number };
    /** Translation service. */
    translator?: DittoTranslator;
    signal: AbortSignal;
    pipeline: Pick<NStore, 'event'>;
  };
}

export class DittoRoute extends Hono<DittoEnv> {
  constructor(opts: HonoOptions<DittoEnv> = {}) {
    super(opts);
    this.init();
  }

  init(): void {
    this.use((c, next) => {
      return next();
    });
  }
}
