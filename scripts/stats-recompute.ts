import { DittoConf } from '@ditto/conf';
import { nip19 } from 'nostr-tools';

import { DittoStorages } from '../packages/ditto/DittoStorages.ts';
import { refreshAuthorStats } from '../packages/ditto/utils/stats.ts';

const conf = new DittoConf(Deno.env);
const storages = new DittoStorages(conf);

let pubkey: string;
try {
  const result = nip19.decode(Deno.args[0]);
  if (result.type === 'npub') {
    pubkey = result.data;
  } else {
    throw new Error('Invalid npub');
  }
} catch {
  console.error('Invalid npub');
  Deno.exit(1);
}

const store = await storages.db();
const kysely = await storages.kysely();

await refreshAuthorStats({ pubkey, kysely, store });
