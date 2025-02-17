import { NostrEvent, NostrFilter, NSchema as n, NStore } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { z } from 'zod';

import { type AppController } from '@/app.ts';
import { getAuthor, getFollowedPubkeys } from '@/queries.ts';
import { booleanParamSchema, fileSchema } from '@/schema.ts';
import { uploadFile } from '../../../utils/upload.ts';
import { nostrNow } from '@/utils.ts';
import {
  assertAuthenticated,
  createEvent,
  paginated,
  parseBody,
  updateEvent,
  updateListEvent,
} from '../../../utils/api.ts';
import { extractIdentifier, lookupAccount, lookupPubkey } from '../../../utils/lookup.ts';
import { renderAccounts, renderEventAccounts, renderStatuses } from '@/views.ts';
import { AccountView } from '@/views/mastodon/AccountView.ts';
import { renderRelationship } from '@/views/mastodon/relationships.ts';
import { StatusView } from '@/views/mastodon/StatusView.ts';
import { metadataSchema } from '@/schemas/nostr.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { bech32ToPubkey } from '@/utils.ts';
import { addTag, deleteTag, findReplyTag, getTagSet } from '../../../utils/tags.ts';
import { getPubkeysBySearch } from '../../../utils/search.ts';

const createAccountSchema = z.object({
  username: z.string().min(1).max(30).regex(/^[a-z0-9_]+$/i),
});

const createAccountController: AppController = async (c) => {
  const { conf, user } = c.var;

  const pubkey = await user!.signer.getPublicKey();
  const result = createAccountSchema.safeParse(await c.req.json());

  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 400);
  }

  if (conf.forbiddenUsernames.includes(result.data.username)) {
    return c.json({ error: 'Username is reserved.' }, 422);
  }

  return c.json({
    access_token: nip19.npubEncode(pubkey),
    token_type: 'Bearer',
    scope: 'read write follow push',
    created_at: nostrNow(),
  });
};

const verifyCredentialsController: AppController = async (c) => {
  const { user, store } = c.var;
  const pubkey = await user!.signer.getPublicKey();

  const [author, [settingsEvent]] = await Promise.all([
    getAuthor(c.var, pubkey),

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

  const view = new AccountView(c.var);
  const account = view.render(author, pubkey, { withSource: true, settingsStore });

  return c.json(account);
};

const accountController: AppController = async (c) => {
  const pubkey = c.req.param('pubkey');
  const event = await getAuthor(c.var, pubkey);

  if (event) {
    assertAuthenticated(c, event);
  }

  const view = new AccountView(c.var);
  const account = view.render(event, pubkey);

  return c.json(account);
};

const accountLookupController: AppController = async (c) => {
  const acct = c.req.query('acct');

  if (!acct) {
    return c.json({ error: 'Missing `acct` query parameter.' }, 422);
  }

  const view = new AccountView(c.var);
  const event = await lookupAccount(c.var, decodeURIComponent(acct));

  if (event) {
    assertAuthenticated(c, event);
    const account = view.render(event);
    return c.json(account);
  }

  const pubkey = bech32ToPubkey(decodeURIComponent(acct));

  if (pubkey) {
    const account = view.render(undefined, pubkey);
    return c.json(account);
  }

  return c.json({ error: 'Could not find user.' }, 404);
};

const accountSearchQuerySchema = z.object({
  q: z.string().transform(decodeURIComponent),
  resolve: booleanParamSchema.optional(),
  following: z.boolean().default(false),
});

const accountSearchController: AppController = async (c) => {
  const { store, kysely, user, pagination, signal } = c.var;
  const { limit } = pagination;

  const result = accountSearchQuerySchema.safeParse(c.req.query());

  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 422);
  }

  const query = decodeURIComponent(result.data.q);
  const lookup = extractIdentifier(query);
  const event = await lookupAccount(c.var, lookup ?? query);
  const view = new AccountView(c.var);
  const viewerPubkey = await user?.signer.getPublicKey();

  if (!event && lookup) {
    const pubkey = await lookupPubkey(c.var, lookup);
    return c.json(pubkey ? [view.render(undefined, pubkey)] : []);
  }

  const events: NostrEvent[] = [];

  if (event) {
    events.push(event);
  } else {
    const following = viewerPubkey ? await getFollowedPubkeys(c.var, viewerPubkey) : new Set<string>();
    const authors = [...await getPubkeysBySearch(kysely, { q: query, limit, offset: 0, following })];
    const profiles = await store.query([{ kinds: [0], authors, limit }], { signal });

    for (const pubkey of authors) {
      const profile = profiles.find((event) => event.pubkey === pubkey);
      if (profile) {
        events.push(profile);
      }
    }
  }

  const accounts = await hydrateEvents(c.var, events)
    .then((events) => events.map((event) => view.render(event)));

  return c.json(accounts);
};

const relationshipsController: AppController = async (c) => {
  const { store, user } = c.var;

  const pubkey = await user!.signer.getPublicKey();
  const ids = z.array(z.string()).safeParse(c.req.queries('id[]'));

  if (!ids.success) {
    return c.json({ error: 'Missing `id[]` query parameters.' }, 422);
  }

  const [sourceEvents, targetEvents] = await Promise.all([
    store.query([{ kinds: [3, 10000], authors: [pubkey] }]),
    store.query([{ kinds: [3], authors: ids.data }]),
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
};

const accountStatusesQuerySchema = z.object({
  pinned: booleanParamSchema.optional(),
  exclude_replies: booleanParamSchema.optional(),
  tagged: z.string().optional(),
  only_media: booleanParamSchema.optional(),
});

const accountStatusesController: AppController = async (c) => {
  const pubkey = c.req.param('pubkey');

  const { conf, store, pagination, signal } = c.var;
  const { pinned, exclude_replies, tagged, only_media } = accountStatusesQuerySchema.parse(c.req.query());

  const [[author], [user]] = await Promise.all([
    store.query([{ kinds: [0], authors: [pubkey], limit: 1 }], { signal }),
    store.query([{ kinds: [30382], authors: [conf.pubkey], '#d': [pubkey], limit: 1 }], { signal }),
  ]);

  if (author) {
    assertAuthenticated(c, author);
  }

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
    kinds: [1, 6, 20],
    ...pagination,
  };

  const search: string[] = [];

  if (only_media) {
    search.push('media:true');
  }

  if (exclude_replies) {
    search.push('reply:false');
  }

  if (tagged) {
    filter['#t'] = [tagged];
  }

  if (search.length) {
    filter.search = search.join(' ');
  }

  const opts = { signal, timeout: conf.db.timeouts.timelines };

  const events = await store.query([filter], opts)
    .then((events) => hydrateEvents(c.var, events))
    .then((events) => {
      if (exclude_replies) {
        return events.filter((event) => {
          if (event.kind === 1) return !findReplyTag(event.tags);
          return true;
        });
      }
      return events;
    });

  const view = new StatusView(c.var);

  const statuses = await Promise.all(
    events.map((event) => view.render(event)),
  );

  return paginated(c, events, statuses);
};

const updateCredentialsSchema = z.object({
  display_name: z.coerce.string().optional(),
  note: z.coerce.string().optional(),
  avatar: fileSchema.or(z.literal('')).optional(),
  header: fileSchema.or(z.literal('')).optional(),
  locked: z.boolean().optional(),
  bot: z.boolean().optional(),
  discoverable: z.boolean().optional(),
  nip05: z.string().email().or(z.literal('')).optional(),
  pleroma_settings_store: z.record(z.string(), z.unknown()).optional(),
  lud16: z.string().email().or(z.literal('')).optional(),
  website: z.string().url().or(z.literal('')).optional(),
  fields_attributes: z.object({ name: z.string(), value: z.string() }).array().optional(),
});

const updateCredentialsController: AppController = async (c) => {
  const { store, user } = c.var;

  const pubkey = await user!.signer.getPublicKey();
  const body = await parseBody(c.req.raw);
  const result = updateCredentialsSchema.safeParse(body);

  if (!result.success) {
    return c.json(result.error, 422);
  }

  const keys = Object.keys(result.data);
  let event: NostrEvent | undefined;

  if (keys.length === 1 && keys[0] === 'pleroma_settings_store') {
    event = (await store.query([{ kinds: [0], authors: [pubkey] }]))[0];
  } else {
    event = await updateEvent(
      c.var,
      { kinds: [0], authors: [pubkey], limit: 1 },
      async (prev) => {
        const meta = n.json().pipe(metadataSchema).catch({}).parse(prev.content);
        const {
          avatar: avatarFile,
          header: headerFile,
          display_name,
          fields_attributes,
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

        if (fields_attributes) {
          meta.fields = fields_attributes.map(({ name, value }) => [name, value]);
        }

        return {
          kind: 0,
          content: JSON.stringify(meta),
          tags: [],
        };
      },
    );
  }

  const settingsStore = result.data.pleroma_settings_store;

  await hydrateEvents(c.var, [event]);

  const view = new AccountView(c.var);
  const account = view.render(event, pubkey, { withSource: true, settingsStore });

  if (settingsStore) {
    await createEvent(c.var, {
      kind: 30078,
      tags: [['d', 'pub.ditto.pleroma_settings_store']],
      content: JSON.stringify(settingsStore),
    });
  }

  return c.json(account);
};

/** https://docs.joinmastodon.org/methods/accounts/#follow */
const followController: AppController = async (c) => {
  const { store, user } = c.var;

  const sourcePubkey = await user!.signer.getPublicKey();
  const targetPubkey = c.req.param('pubkey');

  await updateListEvent(
    c.var,
    { kinds: [3], authors: [sourcePubkey], limit: 1 },
    (tags) => addTag(tags, ['p', targetPubkey]),
  );

  const relationship = await getRelationship(store, sourcePubkey, targetPubkey);

  relationship.following = true;

  return c.json(relationship);
};

/** https://docs.joinmastodon.org/methods/accounts/#unfollow */
const unfollowController: AppController = async (c) => {
  const { store, user } = c.var;

  const sourcePubkey = await user!.signer.getPublicKey();
  const targetPubkey = c.req.param('pubkey');

  await updateListEvent(
    c.var,
    { kinds: [3], authors: [sourcePubkey], limit: 1 },
    (tags) => deleteTag(tags, ['p', targetPubkey]),
  );

  const relationship = await getRelationship(store, sourcePubkey, targetPubkey);
  return c.json(relationship);
};

const followersController: AppController = (c) => {
  const pubkey = c.req.param('pubkey');
  const params = c.get('pagination');
  return renderEventAccounts(c, [{ kinds: [3], '#p': [pubkey], ...params }]);
};

const followingController: AppController = async (c) => {
  const pubkey = c.req.param('pubkey');
  const pubkeys = await getFollowedPubkeys(c.var, pubkey);
  return renderAccounts(c, [...pubkeys]);
};

/** https://docs.joinmastodon.org/methods/accounts/#block */
const blockController: AppController = (c) => {
  return c.json({ error: 'Blocking is not supported by Nostr' }, 422);
};

/** https://docs.joinmastodon.org/methods/accounts/#unblock */
const unblockController: AppController = (c) => {
  return c.json({ error: 'Blocking is not supported by Nostr' }, 422);
};

/** https://docs.joinmastodon.org/methods/accounts/#mute */
const muteController: AppController = async (c) => {
  const { store, user } = c.var;

  const sourcePubkey = await user!.signer.getPublicKey();
  const targetPubkey = c.req.param('pubkey');

  await updateListEvent(
    c.var,
    { kinds: [10000], authors: [sourcePubkey], limit: 1 },
    (tags) => addTag(tags, ['p', targetPubkey]),
  );

  const relationship = await getRelationship(store, sourcePubkey, targetPubkey);
  return c.json(relationship);
};

/** https://docs.joinmastodon.org/methods/accounts/#unmute */
const unmuteController: AppController = async (c) => {
  const { store, user } = c.var;

  const sourcePubkey = await user!.signer.getPublicKey();
  const targetPubkey = c.req.param('pubkey');

  await updateListEvent(
    c.var,
    { kinds: [10000], authors: [sourcePubkey], limit: 1 },
    (tags) => deleteTag(tags, ['p', targetPubkey]),
  );

  const relationship = await getRelationship(store, sourcePubkey, targetPubkey);
  return c.json(relationship);
};

const favouritesController: AppController = async (c) => {
  const { store, user, pagination, signal } = c.var;

  const pubkey = await user!.signer.getPublicKey();

  const events7 = await store.query(
    [{ kinds: [7], authors: [pubkey], ...pagination }],
    { signal },
  );

  const ids = events7
    .map((event) => event.tags.find((tag) => tag[0] === 'e')?.[1])
    .filter((id): id is string => !!id);

  const events = await store.query([{ kinds: [1, 20], ids }], { signal })
    .then((events) => hydrateEvents(c.var, events));

  const view = new StatusView(c.var);

  const statuses = await Promise.all(
    events.map((event) => view.render(event)),
  );

  return paginated(c, events, statuses);
};

const familiarFollowersController: AppController = async (c) => {
  const { store, user } = c.var;

  const ids = z.array(z.string()).parse(c.req.queries('id[]'));
  const pubkey = await user!.signer.getPublicKey();
  const follows = await getFollowedPubkeys(c.var, pubkey);
  const view = new AccountView(c.var);

  const results = await Promise.all(ids.map(async (id) => {
    const followLists = await store
      .query([{ kinds: [3], authors: [...follows], '#p': [id] }])
      .then((events) => hydrateEvents(c.var, events));

    const accounts = followLists.map((event) => view.render(event.author, event.pubkey));

    return { id, accounts };
  }));

  return c.json(results);
};

async function getRelationship(store: NStore, sourcePubkey: string, targetPubkey: string) {
  const [sourceEvents, targetEvents] = await Promise.all([
    store.query([{ kinds: [3, 10000], authors: [sourcePubkey] }]),
    store.query([{ kinds: [3], authors: [targetPubkey] }]),
  ]);

  return renderRelationship({
    sourcePubkey,
    targetPubkey,
    event3: sourceEvents.find((event) => event.kind === 3 && event.pubkey === sourcePubkey),
    target3: targetEvents.find((event) => event.kind === 3 && event.pubkey === targetPubkey),
    event10000: sourceEvents.find((event) => event.kind === 10000 && event.pubkey === sourcePubkey),
  });
}

export {
  accountController,
  accountLookupController,
  accountSearchController,
  accountStatusesController,
  blockController,
  createAccountController,
  familiarFollowersController,
  favouritesController,
  followController,
  followersController,
  followingController,
  muteController,
  relationshipsController,
  unblockController,
  unfollowController,
  unmuteController,
  updateCredentialsController,
  verifyCredentialsController,
};
