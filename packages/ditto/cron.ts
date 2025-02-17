import { DittoConf } from '@ditto/conf';
import { DittoTables } from '@ditto/db';
import { NStore } from '@nostrify/nostrify';
import { Kysely, sql } from 'kysely';

import { DittoTrends } from '@/trends.ts';

interface CronOpts {
  conf: DittoConf;
  kysely: Kysely<DittoTables>;
  store: NStore;
}

/** Start cron jobs for the application. */
export function cron(opts: CronOpts) {
  const trends = new DittoTrends(opts);

  Deno.cron('update trending pubkeys', '0 * * * *', () => trends.updateTrendingPubkeys());
  Deno.cron('update trending zapped events', '7 * * * *', () => trends.updateTrendingZappedEvents());
  Deno.cron('update trending events', '15 * * * *', () => trends.updateTrendingEvents());
  Deno.cron('update trending hashtags', '30 * * * *', () => trends.updateTrendingHashtags());
  Deno.cron('update trending links', '45 * * * *', () => trends.updateTrendingLinks());

  Deno.cron('refresh top authors', '20 * * * *', async () => {
    const { kysely } = opts;
    await sql`refresh materialized view top_authors`.execute(kysely);
  });
}
