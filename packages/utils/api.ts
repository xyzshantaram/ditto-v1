import { DittoConf } from '@ditto/conf';
import { type Context } from '@hono/hono';
import { HTTPException } from '@hono/hono/http-exception';
import { NostrEvent, NostrFilter, NostrSigner, NStore } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';
import { EventTemplate } from 'nostr-tools';
import * as TypeFest from 'type-fest';

import { type AppContext } from '@/app.ts';
import { RelayError } from '@/RelayError.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { nostrNow } from '@/utils.ts';
import { parseFormData } from './formdata.ts';
import { purifyEvent } from './purify.ts';

/** EventTemplate with defaults. */
type EventStub = TypeFest.SetOptional<EventTemplate, 'content' | 'created_at' | 'tags'>;

interface CreateEventOpts {
  conf: DittoConf;
  store: NStore;
  user: {
    signer: NostrSigner;
  };
  signal?: AbortSignal;
}

/** Publish an event through the pipeline. */
async function createEvent(
  opts: CreateEventOpts,
  t: EventStub,
): Promise<NostrEvent> {
  const { user } = opts;

  const event = await user.signer.signEvent({
    content: '',
    created_at: nostrNow(),
    tags: [],
    ...t,
  });

  return publishEvent(opts, event);
}

/** Filter for fetching an existing event to update. */
interface UpdateEventFilter extends NostrFilter {
  kinds: [number];
  limit: 1;
}

/** Update a replaceable event, or throw if no event exists yet. */
async function updateEvent<E extends EventStub>(
  opts: CreateEventOpts,
  filter: UpdateEventFilter,
  fn: (prev: NostrEvent) => E | Promise<E>,
  signal?: AbortSignal,
): Promise<NostrEvent> {
  const { store } = opts;

  const [prev] = await store.query([filter], { signal });

  if (prev) {
    return createEvent(opts, await fn(prev));
  } else {
    throw new HTTPException(422, {
      message: 'No event to update',
    });
  }
}

/** Update a replaceable list event, or throw if no event exists yet. */
function updateListEvent(
  opts: CreateEventOpts,
  filter: UpdateEventFilter,
  fn: (tags: string[][]) => string[][],
): Promise<NostrEvent> {
  return updateEvent(opts, filter, ({ content, tags }) => ({
    kind: filter.kinds[0],
    content,
    tags: fn(tags),
  }));
}

/** Publish an admin event through the pipeline. */
async function createAdminEvent(opts: CreateEventOpts, t: EventStub): Promise<NostrEvent> {
  const { conf } = opts;

  const signer = new AdminSigner(conf);

  const event = await signer.signEvent({
    content: '',
    created_at: nostrNow(),
    tags: [],
    ...t,
  });

  return publishEvent(opts, event);
}

/** Fetch existing event, update its tags, then publish the new admin event. */
function updateListAdminEvent(
  opts: CreateEventOpts,
  filter: UpdateEventFilter,
  fn: (tags: string[][]) => string[][],
): Promise<NostrEvent> {
  return updateAdminEvent(opts, filter, (prev) => ({
    kind: filter.kinds[0],
    content: prev?.content ?? '',
    tags: fn(prev?.tags ?? []),
  }));
}

/** Fetch existing event, update it, then publish the new admin event. */
async function updateAdminEvent<E extends EventStub>(
  opts: CreateEventOpts,
  filter: UpdateEventFilter,
  fn: (prev: NostrEvent | undefined) => E,
): Promise<NostrEvent> {
  const { store, signal } = opts;

  const [prev] = await store.query(
    [{ ...filter, limit: 1 }],
    { signal },
  );

  return createAdminEvent(opts, fn(prev));
}

function updateUser(opts: CreateEventOpts, pubkey: string, n: Record<string, boolean>): Promise<NostrEvent> {
  return updateNames(opts, 30382, pubkey, n);
}

function updateEventInfo(opts: CreateEventOpts, id: string, n: Record<string, boolean>): Promise<NostrEvent> {
  return updateNames(opts, 30383, id, n);
}

async function updateNames(
  opts: CreateEventOpts,
  k: number,
  d: string,
  n: Record<string, boolean>,
): Promise<NostrEvent> {
  const { conf } = opts;

  const signer = new AdminSigner(conf);
  const admin = await signer.getPublicKey();

  return updateAdminEvent(
    opts,
    { kinds: [k], authors: [admin], '#d': [d], limit: 1 },
    (prev) => {
      const prevNames = prev?.tags.reduce((acc, [name, value]) => {
        if (name === 'n') acc[value] = true;
        return acc;
      }, {} as Record<string, boolean>);

      const names = { ...prevNames, ...n };
      const nTags = Object.entries(names).filter(([, value]) => value).map(([name]) => ['n', name]);
      const other = prev?.tags.filter(([name]) => !['d', 'n'].includes(name)) ?? [];

      return {
        kind: k,
        content: prev?.content ?? '',
        tags: [
          ['d', d],
          ...nTags,
          ...other,
        ],
      };
    },
  );
}

/** Push the event through the pipeline, rethrowing any RelayError. */
async function publishEvent(
  opts: CreateEventOpts,
  event: NostrEvent,
): Promise<NostrEvent> {
  const { store, pool, signal } = opts;

  logi({ level: 'info', ns: 'ditto.event', source: 'api', id: event.id, kind: event.kind });

  try {
    event = purifyEvent(event);
    await store.event(event, { signal });
    await pool.event(event, { signal });
  } catch (e) {
    if (e instanceof RelayError) {
      throw new HTTPException(422, e);
    } else {
      throw e;
    }
  }

  return event;
}

/** Parse request body to JSON, depending on the content-type of the request. */
async function parseBody(req: Request): Promise<unknown> {
  switch (req.headers.get('content-type')?.split(';')[0]) {
    case 'multipart/form-data':
    case 'application/x-www-form-urlencoded':
      try {
        return parseFormData(await req.formData());
      } catch {
        throw new HTTPException(400, { message: 'Invalid form data' });
      }
    case 'application/json':
      return req.json();
  }
}

/** Build HTTP Link header for Mastodon API pagination. */
function buildLinkHeader(origin: string, url: string, events: NostrEvent[]): string | undefined {
  if (events.length <= 1) return;
  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];

  const { pathname, search } = new URL(url);
  const next = new URL(pathname + search, origin);
  const prev = new URL(pathname + search, origin);

  next.searchParams.set('until', String(lastEvent.created_at));
  prev.searchParams.set('since', String(firstEvent.created_at));

  return `<${next}>; rel="next", <${prev}>; rel="prev"`;
}

type HeaderRecord = Record<string, string | string[]>;

/** Return results with pagination headers. Assumes chronological sorting of events. */
function paginated(c: AppContext, events: NostrEvent[], body: object | unknown[], headers: HeaderRecord = {}) {
  const { conf } = c.var;
  const { origin } = conf.url;

  const link = buildLinkHeader(origin, c.req.url, events);

  if (link) {
    headers.link = link;
  }

  // Filter out undefined entities.
  const results = Array.isArray(body) ? body.filter(Boolean) : body;
  return c.json(results, 200, headers);
}

/** Build HTTP Link header for paginating Nostr lists. */
function buildListLinkHeader(
  origin: string,
  url: string,
  params: { offset: number; limit: number },
): string | undefined {
  const { pathname, search } = new URL(url);
  const { offset, limit } = params;
  const next = new URL(pathname + search, origin);
  const prev = new URL(pathname + search, origin);

  next.searchParams.set('offset', String(offset + limit));
  prev.searchParams.set('offset', String(Math.max(offset - limit, 0)));

  next.searchParams.set('limit', String(limit));
  prev.searchParams.set('limit', String(limit));

  return `<${next}>; rel="next", <${prev}>; rel="prev"`;
}

/** paginate a list of tags. */
function paginatedList(
  c: AppContext,
  params: { offset: number; limit: number },
  body: object | unknown[],
  headers: HeaderRecord = {},
) {
  const { conf } = c.var;
  const { origin } = conf.url;

  const link = buildListLinkHeader(origin, c.req.url, params);
  const hasMore = Array.isArray(body) ? body.length > 0 : true;

  if (link) {
    headers.link = hasMore ? link : link.split(', ').find((link) => link.endsWith('; rel="prev"'))!;
  }

  // Filter out undefined entities.
  const results = Array.isArray(body) ? body.filter(Boolean) : body;
  return c.json(results, 200, headers);
}

/** Rewrite the URL of the request object to use the local domain. */
function localRequest(c: Context): Request {
  const { conf } = c.var;

  return Object.create(c.req.raw, {
    url: { value: conf.local(c.req.url) },
  });
}

/** Actors with Bluesky's `!no-unauthenticated` self-label should require authorization to view. */
function assertAuthenticated(c: AppContext, author: NostrEvent): void {
  if (
    !c.var.user && author.tags.some(([name, value, ns]) =>
      name === 'l' &&
      value === '!no-unauthenticated' &&
      ns === 'com.atproto.label.defs#selfLabel'
    )
  ) {
    throw new HTTPException(401, { message: 'Sign-in required.' });
  }
}

export {
  assertAuthenticated,
  createAdminEvent,
  createEvent,
  type EventStub,
  localRequest,
  paginated,
  paginatedList,
  parseBody,
  updateAdminEvent,
  updateEvent,
  updateEventInfo,
  updateListAdminEvent,
  updateListEvent,
  updateUser,
};
