import { DittoRoute } from '@ditto/api';
import { paginationMiddleware, userMiddleware } from '@ditto/api/middleware';
import { booleanParamSchema, languageSchema } from '@ditto/api/schema';
import { getTagSet } from '@ditto/utils/tags';
import { z } from 'zod';

import type { Context } from '@hono/hono';
import type { NostrFilter } from '@nostrify/nostrify';
import type { DittoEnv } from '../DittoEnv.ts';

const route = new DittoRoute().use(paginationMiddleware());

const homeQuerySchema = z.object({
  exclude_replies: booleanParamSchema.optional(),
  only_media: booleanParamSchema.optional(),
});

route.get('/home', userMiddleware({ privileged: false, required: true }), async (c) => {
  const { user, pagination } = c.var;

  const pubkey = await user.signer.getPublicKey();
  const result = homeQuerySchema.safeParse(c.req.query());

  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 400);
  }

  const { exclude_replies, only_media } = result.data;

  const authors = [...await getFeedPubkeys(c.var, pubkey)];
  const filter: NostrFilter = { authors, kinds: [1, 6, 20], ...pagination };

  const search: string[] = [];

  if (only_media) {
    search.push('media:true');
  }

  if (exclude_replies) {
    search.push('reply:false');
  }

  if (search.length) {
    filter.search = search.join(' ');
  }

  return renderStatuses(c, [filter]);
});

const publicQuerySchema = z.object({
  local: booleanParamSchema.default('false'),
  instance: z.string().optional(),
  language: languageSchema.optional(),
});

route.get('/public', (c) => {
  const { conf, pagination } = c.var;
  const result = publicQuerySchema.safeParse(c.req.query());

  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 400);
  }

  const { local, instance, language } = result.data;

  const filter: NostrFilter = { kinds: [1, 20], ...pagination };

  const search: `${string}:${string}`[] = [];

  if (local) {
    search.push(`domain:${conf.url.host}`);
  } else if (instance) {
    search.push(`domain:${instance}`);
  }

  if (language) {
    search.push(`language:${language}`);
  }

  if (search.length) {
    filter.search = search.join(' ');
  }

  return renderStatuses(c, [filter]);
});

route.get('/tag/:hashtag', (c) => {
  const { pagination } = c.var;
  const hashtag = c.req.param('hashtag').toLowerCase();

  return renderStatuses(c, [{ kinds: [1, 20], '#t': [hashtag], ...pagination }]);
});

route.get('/suggested', async (c) => {
  const { conf, relay, pagination } = c.var;

  const [follows] = await relay.query(
    [{ kinds: [3], authors: [conf.pubkey], limit: 1 }],
  );

  const authors = [...getTagSet(follows?.tags ?? [], 'p')];

  return renderStatuses(c, [{ authors, kinds: [1, 20], ...pagination }]);
});

/** Render statuses for timelines. */
async function renderStatuses(c: Context<DittoEnv>, filters: NostrFilter[]) {
  const { conf, store, user, signal } = c.var;
  const opts = { signal, timeout: conf.db.timeouts.timelines };

  const events = await store
    .query(filters, opts)
    .then((events) => hydrateEvents(c.var, events));

  if (!events.length) {
    return c.json([]);
  }

  const view = new StatusView(c.var);
  const statuses = (await Promise.all(events.map((event) => view.render(event)))).filter(Boolean);

  if (!statuses.length) {
    return c.json([]);
  }

  return paginated(c, events, statuses);
}

export { route as timelinesRoute };
