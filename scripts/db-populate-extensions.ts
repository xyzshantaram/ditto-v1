import { DittoConf } from '@ditto/conf';
import { NostrEvent } from '@nostrify/nostrify';

import { DittoStorages } from '../packages/ditto/DittoStorages.ts';
import { EventsDB } from '../packages/ditto/storages/EventsDB.ts';

const conf = new DittoConf(Deno.env);
const storages = new DittoStorages(conf);
const kysely = await storages.kysely();

const query = kysely
  .selectFrom('nostr_events')
  .select(['id', 'kind', 'content', 'pubkey', 'tags', 'created_at', 'sig']);

for await (const row of query.stream()) {
  const event: NostrEvent = { ...row, created_at: Number(row.created_at) };
  const ext = EventsDB.indexExtensions(event);

  try {
    await kysely
      .updateTable('nostr_events')
      .set('search_ext', ext)
      .where('id', '=', event.id)
      .execute();
  } catch {
    // do nothing
  }
}

Deno.exit();
