import { Kysely, sql } from 'kysely';

import { DittoTables } from '@/db/DittoTables.ts';

/** Get pubkeys whose name and NIP-05 is similar to 'q' */
export async function getPubkeysBySearch(
  kysely: Kysely<DittoTables>,
  opts: { q: string; limit: number; followedPubkeys: Set<string> },
): Promise<Set<string>> {
  const { q, limit, followedPubkeys } = opts;

  let query = kysely
    .selectFrom('author_search')
    .leftJoin('author_stats', 'author_stats.pubkey', 'author_search.pubkey')
    .select((eb) => [
      'author_search.pubkey',
      'search',
      eb.fn('word_similarity', [sql`${q}`, 'search']).as('sml'),
      eb.fn.coalesce('author_stats.followers_count', sql<number>`0`).as('followers_count'),
    ])
    .where(() => sql`${q} <% search`)
    .orderBy(['followers_count desc'])
    .orderBy(['sml desc', 'search'])
    .limit(limit);

  const pubkeys = new Set((await query.execute()).map(({ pubkey }) => pubkey));

  if (followedPubkeys.size > 0) {
    query = query.where('author_search.pubkey', 'in', [...followedPubkeys]);
  }

  const followingPubkeys = new Set((await query.execute()).map(({ pubkey }) => pubkey));

  return new Set(Array.from(followingPubkeys.union(pubkeys)).slice(0, limit));
}
