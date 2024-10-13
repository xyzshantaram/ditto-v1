import { Hono } from '@hono/hono';
import { NostrFilter, NSchema as n } from '@nostrify/nostrify';
import { z } from 'zod';

import { Conf } from '@/config.ts';
import { getAuthor, getFollowedPubkeys } from '@/queries.ts';
import { booleanParamSchema, fileSchema } from '@/schema.ts';
import { Storages } from '@/storages.ts';
import { uploadFile } from '@/utils/upload.ts';
import { createEvent, paginated, parseBody, updateEvent, updateListEvent } from '@/utils/api.ts';
import { extractIdentifier, lookupAccount, lookupPubkey } from '@/utils/lookup.ts';
import { renderAccounts, renderEventAccounts, renderStatuses } from '@/views.ts';
import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';
import { renderRelationship } from '@/views/mastodon/relationships.ts';
import { renderReblog, renderStatus } from '@/views/mastodon/statuses.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { bech32ToPubkey } from '@/utils.ts';
import { addTag, deleteTag, findReplyTag, getTagSet } from '@/utils/tags.ts';
import { getPubkeysBySearch } from '@/utils/search.ts';
import { requireSigner } from '@/middleware/requireSigner.ts';
import { paginationMiddleware } from '@/middleware/paginationMiddleware.ts';

export const accountsController = new Hono();

accountsController.post('/', (c) => {
  return c.json({ error: 'Please create an account on the web first' }, 422);
});

accountsController.get('/verify_credentials', requireSigner, async (c) => {
  const signer = c.get('signer');
  const pubkey = await signer.getPublicKey();

  const store = await Storages.db();

  const [author, [settingsEvent]] = await Promise.all([
    getAuthor(pubkey, { signal: AbortSignal.timeout(5000) }),

    store.query([{
      kinds: [30078],
      authors: [pubkey],
      '#d': ['pub.ditto.pleroma_settings_store'],
      limit: 1,
    }]),
  ]);

  let settingsStore: Record<string, unknown> | undefined;
  try {
    settingsStore = n.json().pipe(z.record(z.string(), z.unknown())).parse(settingsEvent?.content);
  } catch {
    // Do nothing
  }

  const account = author
    ? await renderAccount(author, { withSource: true, settingsStore })
    : await accountFromPubkey(pubkey, { withSource: true, settingsStore });

  return c.json(account);
});

accountsController.get('/:pubkey{[0-9a-f]{64}}', async (c) => {
  const pubkey = c.req.param('pubkey');

  const event = await getAuthor(pubkey);
  if (event) {
    return c.json(await renderAccount(event));
  } else {
    return c.json(await accountFromPubkey(pubkey));
  }
});

accountsController.get('/lookup', async (c) => {
  const acct = c.req.query('acct');

  if (!acct) {
    return c.json({ error: 'Missing `acct` query parameter.' }, 422);
  }

  const event = await lookupAccount(decodeURIComponent(acct));
  if (event) {
    return c.json(await renderAccount(event));
  }
  try {
    const pubkey = bech32ToPubkey(decodeURIComponent(acct));
    return c.json(await accountFromPubkey(pubkey!));
  } catch {
    return c.json({ error: 'Could not find user.' }, 404);
  }
});

const accountSearchQuerySchema = z.object({
  q: z.string().transform(decodeURIComponent),
  resolve: booleanParamSchema.optional().transform(Boolean),
  following: z.boolean().default(false),
});

accountsController.get('/search', paginationMiddleware, async (c) => {
  const { signal } = c.req.raw;
  const { limit } = c.get('pagination');
  const kysely = await Storages.kysely();
  const viewerPubkey = await c.get('signer')?.getPublicKey();

  const result = accountSearchQuerySchema.safeParse(c.req.query());

  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 422);
  }

  const query = decodeURIComponent(result.data.q);
  const store = await Storages.search();

  const lookup = extractIdentifier(query);
  const event = await lookupAccount(lookup ?? query);

  if (!event && lookup) {
    const pubkey = await lookupPubkey(lookup);
    return c.json(pubkey ? [await accountFromPubkey(pubkey)] : []);
  }

  const followedPubkeys: Set<string> = viewerPubkey ? await getFollowedPubkeys(viewerPubkey) : new Set();
  const pubkeys = Array.from(await getPubkeysBySearch(kysely, { q: query, limit, followedPubkeys }));

  let events = event ? [event] : await store.query([{ kinds: [0], authors: pubkeys, limit }], {
    signal,
  });

  if (!event) {
    events = pubkeys
      .map((pubkey) => events.find((event) => event.pubkey === pubkey))
      .filter((event) => !!event);
  }
  const accounts = await hydrateEvents({ events, store, signal }).then(
    (events) =>
      Promise.all(
        events.map((event) => renderAccount(event)),
      ),
  );

  return c.json(accounts);
});

accountsController.get('/relationships', requireSigner, async (c) => {
  const pubkey = await c.get('signer').getPublicKey();
  const ids = z.array(z.string()).safeParse(c.req.queries('id[]'));

  if (!ids.success) {
    return c.json({ error: 'Missing `id[]` query parameters.' }, 422);
  }

  const db = await Storages.db();

  const [sourceEvents, targetEvents] = await Promise.all([
    db.query([{ kinds: [3, 10000], authors: [pubkey] }]),
    db.query([{ kinds: [3], authors: ids.data }]),
  ]);

  const event3 = sourceEvents.find((event) => event.kind === 3 && event.pubkey === pubkey);
  const event10000 = sourceEvents.find((event) => event.kind === 10000 && event.pubkey === pubkey);

  const result = ids.data.map((id) =>
    renderRelationship({
      sourcePubkey: pubkey,
      targetPubkey: id,
      event3,
      target3: targetEvents.find((event) => event.kind === 3 && event.pubkey === id),
      event10000,
    })
  );

  return c.json(result);
});

const accountStatusesQuerySchema = z.object({
  pinned: booleanParamSchema.optional(),
  limit: z.coerce.number().nonnegative().transform((v) => Math.min(v, 40)).catch(20),
  exclude_replies: booleanParamSchema.optional(),
  tagged: z.string().optional(),
});

accountsController.get('/:pubkey{[0-9a-f]{64}}/statuses', paginationMiddleware, async (c) => {
  const pubkey = c.req.param('pubkey');
  const { since, until } = c.get('pagination');
  const { pinned, limit, exclude_replies, tagged } = accountStatusesQuerySchema.parse(c.req.query());
  const { signal } = c.req.raw;

  const store = await Storages.db();

  const [user] = await store.query([{ kinds: [30382], authors: [Conf.pubkey], '#d': [pubkey], limit: 1 }], { signal });
  const names = getTagSet(user?.tags ?? [], 'n');

  if (names.has('disabled')) {
    return c.json([]);
  }

  if (pinned) {
    const [pinEvent] = await store.query([{ kinds: [10001], authors: [pubkey], limit: 1 }], { signal });
    if (pinEvent) {
      const pinnedEventIds = getTagSet(pinEvent.tags, 'e');
      return renderStatuses(c, [...pinnedEventIds].reverse());
    } else {
      return c.json([]);
    }
  }

  const filter: NostrFilter = {
    authors: [pubkey],
    kinds: [1, 6],
    since,
    until,
    limit,
  };

  if (tagged) {
    filter['#t'] = [tagged];
  }

  const opts = { signal, limit, timeout: Conf.db.timeouts.timelines };

  const events = await store.query([filter], opts)
    .then((events) => hydrateEvents({ events, store, signal }))
    .then((events) => {
      if (exclude_replies) {
        return events.filter((event) => {
          if (event.kind === 1) return !findReplyTag(event.tags);
          return true;
        });
      }
      return events;
    });

  const viewerPubkey = await c.get('signer')?.getPublicKey();

  const statuses = await Promise.all(
    events.map((event) => {
      if (event.kind === 6) return renderReblog(event, { viewerPubkey });
      return renderStatus(event, { viewerPubkey });
    }),
  );

  return paginated(c, events, statuses);
});

const updateCredentialsSchema = z.object({
  display_name: z.string().optional(),
  note: z.string().optional(),
  avatar: fileSchema.or(z.literal('')).optional(),
  header: fileSchema.or(z.literal('')).optional(),
  locked: z.boolean().optional(),
  bot: z.boolean().optional(),
  discoverable: z.boolean().optional(),
  nip05: z.string().email().or(z.literal('')).optional(),
  pleroma_settings_store: z.record(z.string(), z.unknown()).optional(),
  lud16: z.string().email().or(z.literal('')).optional(),
  website: z.string().url().or(z.literal('')).optional(),
});

accountsController.patch('/update_credentials', requireSigner, async (c) => {
  const signer = c.get('signer');
  const pubkey = await signer.getPublicKey();
  const body = await parseBody(c.req.raw);
  const result = updateCredentialsSchema.safeParse(body);

  if (!result.success) {
    return c.json(result.error, 422);
  }

  const event = await updateEvent(
    { kinds: [0], authors: [pubkey], limit: 1 },
    async (prev) => {
      const meta = n.json().pipe(n.metadata()).catch({}).parse(prev.content);
      const {
        avatar: avatarFile,
        header: headerFile,
        display_name,
        note,
        nip05,
        lud16,
        website,
        bot,
      } = result.data;

      const [avatar, header] = await Promise.all([
        avatarFile ? uploadFile(c, avatarFile, { pubkey }) : undefined,
        headerFile ? uploadFile(c, headerFile, { pubkey }) : undefined,
      ]);

      meta.name = display_name ?? meta.name;
      meta.about = note ?? meta.about;
      meta.picture = avatar?.url ?? meta.picture;
      meta.banner = header?.url ?? meta.banner;
      meta.nip05 = nip05 ?? meta.nip05;
      meta.lud16 = lud16 ?? meta.lud16;
      meta.website = website ?? meta.website;
      meta.bot = bot ?? meta.bot;

      if (avatarFile === '') delete meta.picture;
      if (headerFile === '') delete meta.banner;
      if (nip05 === '') delete meta.nip05;
      if (lud16 === '') delete meta.lud16;
      if (website === '') delete meta.website;

      return {
        kind: 0,
        content: JSON.stringify(meta),
        tags: [],
      };
    },
    c,
  );

  const settingsStore = result.data.pleroma_settings_store;
  const account = await renderAccount(event, { withSource: true, settingsStore });

  if (settingsStore) {
    await createEvent({
      kind: 30078,
      tags: [['d', 'pub.ditto.pleroma_settings_store']],
      content: JSON.stringify(settingsStore),
    }, c);
  }

  return c.json(account);
});

// https://docs.joinmastodon.org/methods/accounts/#follow
accountsController.post('/:pubkey{[0-9a-f]{64}}/follow', requireSigner, async (c) => {
  const sourcePubkey = await c.get('signer').getPublicKey();
  const targetPubkey = c.req.param('pubkey');

  await updateListEvent(
    { kinds: [3], authors: [sourcePubkey], limit: 1 },
    (tags) => addTag(tags, ['p', targetPubkey]),
    c,
  );

  const relationship = await getRelationship(sourcePubkey, targetPubkey);
  relationship.following = true;

  return c.json(relationship);
});

// https://docs.joinmastodon.org/methods/accounts/#unfollow
accountsController.post('/:pubkey{[0-9a-f]{64}}/unfollow', requireSigner, async (c) => {
  const sourcePubkey = await c.get('signer')?.getPublicKey()!;
  const targetPubkey = c.req.param('pubkey');

  await updateListEvent(
    { kinds: [3], authors: [sourcePubkey], limit: 1 },
    (tags) => deleteTag(tags, ['p', targetPubkey]),
    c,
  );

  const relationship = await getRelationship(sourcePubkey, targetPubkey);
  return c.json(relationship);
});

accountsController.get('/:pubkey{[0-9a-f]{64}}/followers', paginationMiddleware, (c) => {
  const pubkey = c.req.param('pubkey');
  const params = c.get('pagination');
  return renderEventAccounts(c, [{ kinds: [3], '#p': [pubkey], ...params }]);
});

accountsController.get('/:pubkey{[0-9a-f]{64}}/following', paginationMiddleware, async (c) => {
  const pubkey = c.req.param('pubkey');
  const pubkeys = await getFollowedPubkeys(pubkey);
  return renderAccounts(c, [...pubkeys]);
});

// https://docs.joinmastodon.org/methods/accounts/#block
accountsController.post('/:pubkey{[0-9a-f]{64}}/block', (c) => {
  return c.json({ error: 'Blocking is not supported by Nostr' }, 422);
});

// https://docs.joinmastodon.org/methods/accounts/#unblock
accountsController.post('/:pubkey{[0-9a-f]{64}}/unblock', (c) => {
  return c.json({ error: 'Blocking is not supported by Nostr' }, 422);
});

// https://docs.joinmastodon.org/methods/accounts/#mute
accountsController.post('/:pubkey{[0-9a-f]{64}}/mute', requireSigner, async (c) => {
  const sourcePubkey = await c.get('signer').getPublicKey();
  const targetPubkey = c.req.param('pubkey');

  await updateListEvent(
    { kinds: [10000], authors: [sourcePubkey], limit: 1 },
    (tags) => addTag(tags, ['p', targetPubkey]),
    c,
  );

  const relationship = await getRelationship(sourcePubkey, targetPubkey);
  return c.json(relationship);
});

// https://docs.joinmastodon.org/methods/accounts/#unmute
accountsController.post('/:pubkey{[0-9a-f]{64}}/unmute', requireSigner, async (c) => {
  const sourcePubkey = await c.get('signer').getPublicKey();
  const targetPubkey = c.req.param('pubkey');

  await updateListEvent(
    { kinds: [10000], authors: [sourcePubkey], limit: 1 },
    (tags) => deleteTag(tags, ['p', targetPubkey]),
    c,
  );

  const relationship = await getRelationship(sourcePubkey, targetPubkey);
  return c.json(relationship);
});

accountsController.get('/familiar_followers', requireSigner, async (c) => {
  const store = await Storages.db();
  const signer = c.get('signer');
  const pubkey = await signer.getPublicKey();

  const ids = z.array(z.string()).parse(c.req.queries('id[]'));
  const follows = await getFollowedPubkeys(pubkey);

  const results = await Promise.all(ids.map(async (id) => {
    const followLists = await store.query([{ kinds: [3], authors: [...follows], '#p': [id] }])
      .then((events) => hydrateEvents({ events, store }));

    const accounts = await Promise.all(
      followLists.map((event) => event.author ? renderAccount(event.author) : accountFromPubkey(event.pubkey)),
    );

    return { id, accounts };
  }));

  return c.json(results);
});

async function getRelationship(sourcePubkey: string, targetPubkey: string) {
  const db = await Storages.db();

  const [sourceEvents, targetEvents] = await Promise.all([
    db.query([{ kinds: [3, 10000], authors: [sourcePubkey] }]),
    db.query([{ kinds: [3], authors: [targetPubkey] }]),
  ]);

  return renderRelationship({
    sourcePubkey,
    targetPubkey,
    event3: sourceEvents.find((event) => event.kind === 3 && event.pubkey === sourcePubkey),
    target3: targetEvents.find((event) => event.kind === 3 && event.pubkey === targetPubkey),
    event10000: sourceEvents.find((event) => event.kind === 10000 && event.pubkey === sourcePubkey),
  });
}
