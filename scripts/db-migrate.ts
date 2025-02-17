import { DittoConf } from '@ditto/conf';

import { DittoStorages } from '../packages/ditto/DittoStorages.ts';

const conf = new DittoConf(Deno.env);
const storages = new DittoStorages(conf);

// This migrates kysely internally.
const kysely = await storages.kysely();

// Close the connection before exiting.
await kysely.destroy();

Deno.exit();
