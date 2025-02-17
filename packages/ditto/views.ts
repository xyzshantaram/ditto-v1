import { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { AppContext } from '@/app.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { paginated, paginatedList } from '../utils/api.ts';
import { AccountView } from '@/views/mastodon/AccountView.ts';
import { StatusView } from '@/views/mastodon/StatusView.ts';

interface RenderEventAccountsOpts {
  signal?: AbortSignal;
  filterFn?: (event: NostrEvent) => boolean;
}

/** Render account objects for the author of each event. */
async function renderEventAccounts(c: AppContext, filters: NostrFilter[], opts?: RenderEventAccountsOpts) {
  if (!filters.length) {
    return c.json([]);
  }

  const { store } = c.var;
  const { signal = AbortSignal.timeout(1000), filterFn } = opts ?? {};

  const events = await store.query(filters, { signal })
    // Deduplicate by author.
    .then((events) => Array.from(new Map(events.map((event) => [event.pubkey, event])).values()))
    .then((events) => hydrateEvents(c.var, events))
    .then((events) => filterFn ? events.filter(filterFn) : events);

  const view = new AccountView(c.var);
  const accounts = events.map(({ author, pubkey }) => view.render(author, pubkey));

  return paginated(c, events, accounts);
}

async function renderAccounts(c: AppContext, pubkeys: string[]) {
  const { offset, limit } = c.get('listPagination');
  const authors = pubkeys.reverse().slice(offset, offset + limit);

  const { store } = c.var;
  const signal = c.req.raw.signal;

  const events = await store
    .query([{ kinds: [0], authors }], { signal })
    .then((events) => hydrateEvents(c.var, events));

  const view = new AccountView(c.var);

  const accounts = authors.map((pubkey) => {
    const event = events.find((event) => event.pubkey === pubkey);
    return view.render(event, pubkey);
  });

  return paginatedList(c, { offset, limit }, accounts);
}

/** Render statuses by event IDs. */
async function renderStatuses(c: AppContext, ids: string[], signal = AbortSignal.timeout(1000)) {
  if (!ids.length) {
    return c.json([]);
  }

  const { store, pagination } = c.var;
  const { limit } = pagination;

  const events = await store
    .query([{ kinds: [1, 20], ids, limit }], { signal })
    .then((events) => hydrateEvents(c.var, events));

  if (!events.length) {
    return c.json([]);
  }

  const sortedEvents = [...events].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

  const view = new StatusView(c.var);

  const statuses = await Promise.all(
    sortedEvents.map((event) => view.render(event)),
  );

  // TODO: pagination with min_id and max_id based on the order of `ids`.
  return c.json(statuses);
}

export { renderAccounts, renderEventAccounts, renderStatuses };
