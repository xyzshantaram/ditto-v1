import { Hono } from '@hono/hono';

import { paginationMiddleware } from '@/middleware/paginationMiddleware.ts';
import { requireSigner } from '@/middleware/requireSigner.ts';
import { Storages } from '@/storages.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { paginated } from '@/utils/api.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';

export const favouritesController = new Hono();

favouritesController.get('/', paginationMiddleware, requireSigner, async (c) => {
  const pubkey = await c.get('signer').getPublicKey();
  const params = c.get('pagination');
  const { signal } = c.req.raw;

  const store = await Storages.db();

  const events7 = await store.query(
    [{ kinds: [7], authors: [pubkey], ...params }],
    { signal },
  );

  const ids = events7
    .map((event) => event.tags.find((tag) => tag[0] === 'e')?.[1])
    .filter((id): id is string => !!id);

  const events1 = await store.query([{ kinds: [1], ids }], { signal })
    .then((events) => hydrateEvents({ events, store, signal }));

  const statuses = await Promise.all(
    events1.map((event) => renderStatus(event, { viewerPubkey: pubkey })),
  );
  return paginated(c, events1, statuses);
});
