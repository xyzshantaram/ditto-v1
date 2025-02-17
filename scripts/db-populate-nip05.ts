import { Semaphore } from '@core/asyncutil';
import { DittoConf } from '@ditto/conf';
import { NostrEvent } from '@nostrify/nostrify';

import { DittoPipeline } from '../packages/ditto/DittoPipeline.ts';
import { DittoStorages } from '../packages/ditto/DittoStorages.ts';

const conf = new DittoConf(Deno.env);
const storages = new DittoStorages(conf);

const pipeline = new DittoPipeline({
  conf,
  kysely: await storages.kysely(),
  store: await storages.db(),
  pubsub: await storages.pubsub(),
});

const kysely = await storages.kysely();
const sem = new Semaphore(5);

const query = kysely
  .selectFrom('nostr_events')
  .select(['id', 'kind', 'content', 'pubkey', 'tags', 'created_at', 'sig'])
  .where('kind', '=', 0);

for await (const row of query.stream(100)) {
  while (sem.locked) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  sem.lock(async () => {
    const event: NostrEvent = { ...row, created_at: Number(row.created_at) };
    await pipeline.updateAuthorData(event, AbortSignal.timeout(3000));
  });
}

Deno.exit();
