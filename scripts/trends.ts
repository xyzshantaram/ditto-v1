import { DittoConf } from '@ditto/conf';
import { z } from 'zod';

import { DittoTrends } from '../packages/ditto/trends.ts';
import { DittoStorages } from '../packages/ditto/DittoStorages.ts';

const trendNameSchema = z.enum(['pubkeys', 'zapped_events', 'events', 'hashtags', 'links']);
const names = trendNameSchema.array().parse(Deno.args);

if (!names.length) {
  names.push('pubkeys', 'zapped_events', 'events', 'hashtags', 'links');
}

const conf = new DittoConf(Deno.env);
const storages = new DittoStorages(conf);

const trends = new DittoTrends({ conf, kysely: await storages.kysely(), store: await storages.db() });

for (const name of names) {
  switch (name) {
    case 'pubkeys':
      console.log('Updating trending pubkeys...');
      await trends.updateTrendingPubkeys();
      break;
    case 'zapped_events':
      console.log('Updating trending zapped events...');
      await trends.updateTrendingZappedEvents();
      break;
    case 'events':
      console.log('Updating trending events...');
      await trends.updateTrendingEvents();
      break;
    case 'hashtags':
      console.log('Updating trending hashtags...');
      await trends.updateTrendingHashtags();
      break;
    case 'links':
      console.log('Updating trending links...');
      await trends.updateTrendingLinks();
      break;
  }
}

console.log('Trends updated.');
Deno.exit(0);
