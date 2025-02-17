import { DittoConf } from '@ditto/conf';
import { DittoTables } from '@ditto/db';
import { NostrEvent, NostrFilter, NSchema as n, NStore } from '@nostrify/nostrify';
import { Kysely } from 'kysely';
import { nip19 } from 'nostr-tools';
import { z } from 'zod';

import { AppController } from '@/app.ts';
import { booleanParamSchema } from '@/schema.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { extractIdentifier, lookupPubkey } from '../../../utils/lookup.ts';
import { resolveNip05 } from '../../../utils/nip05.ts';
import { AccountView } from '@/views/mastodon/AccountView.ts';
import { StatusView } from '@/views/mastodon/StatusView.ts';
import { getFollowedPubkeys } from '@/queries.ts';
import { getPubkeysBySearch } from '../../../utils/search.ts';
import { paginated, paginatedList } from '../../../utils/api.ts';

const searchQuerySchema = z.object({
  q: z.string().transform(decodeURIComponent),
  type: z.enum(['accounts', 'statuses', 'hashtags']).optional(),
  resolve: booleanParamSchema.optional().transform(Boolean),
  following: z.boolean().default(false),
  account_id: n.id().optional(),
  offset: z.coerce.number().nonnegative().catch(0),
});

type SearchQuery = z.infer<typeof searchQuerySchema> & { since?: number; until?: number; limit: number };

const searchController: AppController = async (c) => {
  const { pagination } = c.var;

  const result = searchQuerySchema.safeParse(c.req.query());

  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 422);
  }

  const event = await lookupEvent(c.var, { ...result.data, ...pagination });
  const lookup = extractIdentifier(result.data.q);

  const accountView = new AccountView(c.var);
  const statusView = new StatusView(c.var);

  // Render account from pubkey.
  if (!event && lookup) {
    const pubkey = await lookupPubkey(c.var, lookup);

    return c.json({
      accounts: pubkey ? [accountView.render(undefined, pubkey)] : [],
      statuses: [],
      hashtags: [],
    });
  }

  let events: NostrEvent[] = [];

  if (event) {
    events = [event];
  }

  events.push(...(await searchEvents(c.var, { ...result.data, ...pagination })));

  const [accounts, statuses] = await Promise.all([
    Promise.all(
      events
        .filter((event) => event.kind === 0)
        .map((event) => accountView.render(event))
        .filter(Boolean),
    ),
    Promise.all(
      events
        .filter((event) => event.kind === 1)
        .map((event) => statusView.render(event))
        .filter(Boolean),
    ),
  ]);

  const body = {
    accounts,
    statuses,
    hashtags: [],
  };

  if (result.data.type === 'accounts') {
    return paginatedList(c, { ...result.data, ...pagination }, body);
  } else {
    return paginated(c, events, body);
  }
};

interface SearchEventsOpts {
  conf: DittoConf;
  store: NStore;
  kysely: Kysely<DittoTables>;
  signal?: AbortSignal;
}

/** Get events for the search params. */
async function searchEvents(
  opts: SearchEventsOpts,
  { q, type, since, until, limit, offset, account_id, viewerPubkey }: SearchQuery & { viewerPubkey?: string },
): Promise<NostrEvent[]> {
  const { store, kysely, signal } = opts;

  // Hashtag search is not supported.
  if (type === 'hashtags') {
    return Promise.resolve([]);
  }

  const filter: NostrFilter = {
    kinds: typeToKinds(type),
    search: q,
    since,
    until,
    limit,
  };

  // For account search, use a special index, and prioritize followed accounts.
  if (type === 'accounts') {
    const following = viewerPubkey ? await getFollowedPubkeys(store, viewerPubkey) : new Set<string>();
    const searchPubkeys = await getPubkeysBySearch(kysely, { q, limit, offset, following });

    filter.authors = [...searchPubkeys];
    filter.search = undefined;
  }

  // Results should only be shown from one author.
  if (account_id) {
    filter.authors = [account_id];
  }

  // Query the events.
  let events = await store
    .query([filter], { signal })
    .then((events) => hydrateEvents(opts, events));

  // When using an authors filter, return the events in the same order as the filter.
  if (filter.authors) {
    events = filter.authors
      .map((pubkey) => events.find((event) => event.pubkey === pubkey))
      .filter((event) => !!event);
  }

  return events;
}

/** Get event kinds to search from `type` query param. */
function typeToKinds(type: SearchQuery['type']): number[] {
  switch (type) {
    case 'accounts':
      return [0];
    case 'statuses':
      return [1];
    default:
      return [0, 1];
  }
}

interface LookupEventOpts {
  conf: DittoConf;
  store: NStore;
  kysely: Kysely<DittoTables>;
  signal?: AbortSignal;
}

/** Resolve a searched value into an event, if applicable. */
async function lookupEvent(opts: LookupEventOpts, query: SearchQuery): Promise<NostrEvent | undefined> {
  const { store, signal } = opts;
  const filters = await getLookupFilters(opts, query);

  const _opts = { limit: 1, signal };

  return store.query(filters, _opts)
    .then((events) => hydrateEvents(opts, events))
    .then(([event]) => event);
}

/** Get filters to lookup the input value. */
async function getLookupFilters(opts: LookupEventOpts, { q, type, resolve }: SearchQuery): Promise<NostrFilter[]> {
  const accounts = !type || type === 'accounts';
  const statuses = !type || type === 'statuses';

  if (!resolve || type === 'hashtags') {
    return [];
  }

  if (n.id().safeParse(q).success) {
    const filters: NostrFilter[] = [];
    if (accounts) filters.push({ kinds: [0], authors: [q], limit: 1 });
    if (statuses) filters.push({ kinds: [1, 20], ids: [q], limit: 1 });
    return filters;
  }

  const lookup = extractIdentifier(q);
  if (!lookup) return [];

  try {
    const result = nip19.decode(lookup);
    const filters: NostrFilter[] = [];
    switch (result.type) {
      case 'npub':
        if (accounts) filters.push({ kinds: [0], authors: [result.data], limit: 1 });
        break;
      case 'nprofile':
        if (accounts) filters.push({ kinds: [0], authors: [result.data.pubkey], limit: 1 });
        break;
      case 'note':
        if (statuses) filters.push({ kinds: [1, 20], ids: [result.data], limit: 1 });
        break;
      case 'nevent':
        if (statuses) filters.push({ kinds: [1, 20], ids: [result.data.id], limit: 1 });
        break;
    }
    return filters;
  } catch {
    // fall through
  }

  try {
    const { pubkey } = await resolveNip05(opts, lookup);
    if (pubkey) {
      return [{ kinds: [0], authors: [pubkey], limit: 1 }];
    }
  } catch {
    // fall through
  }

  return [];
}

export { searchController };
