import { DittoConf } from '@ditto/conf';

import { DittoStorages } from '../packages/ditto/DittoStorages.ts';
import { PolicyWorker } from '../packages/ditto/workers/policy.ts';

const conf = new DittoConf(Deno.env);
const storages = new DittoStorages(conf);
const policy = new PolicyWorker(conf);

const db = await storages.db();
let count = 0;

for await (const msg of db.req([{}])) {
  const [type, , event] = msg;
  if (type === 'EOSE') console.log('EOSE');
  if (type !== 'EVENT') continue;
  const [, , ok] = await policy.call(event, AbortSignal.timeout(5000));
  if (!ok) {
    await db.remove([{ ids: [event.id] }]);
    count += 1;
  }
}

console.log(`Cleaned up ${count} events from the db.`);
Deno.exit(0);
