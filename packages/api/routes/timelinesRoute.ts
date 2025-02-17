import { DittoRoute } from '@ditto/api';
import { z } from 'zod';

import type { NostrFilter } from '@nostrify/nostrify';

const route = new DittoRoute();

const homeQuerySchema = z.object({
  exclude_replies: booleanParamSchema.optional(),
  only_media: booleanParamSchema.optional(),
});

route.get('/home', async (c) => {
  c.req.valid('json');
  const { user, pagination } = c.var;

  const pubkey = await user!.signer.getPublicKey()!;
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

const publicTimelineController: AppController = (c) => {
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
};

const hashtagTimelineController: AppController = (c) => {
  const { pagination } = c.var;
  const hashtag = c.req.param('hashtag')!.toLowerCase();
  return renderStatuses(c, [{ kinds: [1, 20], '#t': [hashtag], ...pagination }]);
};

const suggestedTimelineController: AppController = async (c) => {
  const { conf } = c.var;
  const store = c.get('store');
  const params = c.get('pagination');

  const [follows] = await store.query(
    [{ kinds: [3], authors: [conf.pubkey], limit: 1 }],
  );

  const authors = [...getTagSet(follows?.tags ?? [], 'p')];

  return renderStatuses(c, [{ authors, kinds: [1, 20], ...params }]);
};

/** Render statuses for timelines. */
async function renderStatuses(c: AppContext, filters: NostrFilter[]) {
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

export { hashtagTimelineController, homeTimelineController, publicTimelineController, suggestedTimelineController };
