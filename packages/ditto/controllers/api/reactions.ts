import { AppController } from '@/app.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { createEvent } from '@/utils/api.ts';
import { AccountView } from '@/views/mastodon/AccountView.ts';
import { StatusView } from '@/views/mastodon/StatusView.ts';

/**
 * React to a status.
 * https://docs.pleroma.social/backend/development/API/pleroma_api/#put-apiv1pleromastatusesidreactionsemoji
 */
const reactionController: AppController = async (c) => {
  const id = c.req.param('id');
  const emoji = c.req.param('emoji');

  const { store } = c.var;

  if (!/^\p{RGI_Emoji}$/v.test(emoji)) {
    return c.json({ error: 'Invalid emoji' }, 400);
  }

  const [event] = await store.query([{ kinds: [1, 20], ids: [id], limit: 1 }]);

  if (!event) {
    return c.json({ error: 'Status not found' }, 404);
  }

  await createEvent(c.var, {
    kind: 7,
    content: emoji,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['e', id], ['p', event.pubkey]],
  });

  await hydrateEvents(c.var, [event]);

  const view = new StatusView(c.var);
  const status = await view.render(event);

  return c.json(status);
};

/**
 * Delete reactions to a status.
 * https://docs.pleroma.social/backend/development/API/pleroma_api/#delete-apiv1pleromastatusesidreactionsemoji
 */
const deleteReactionController: AppController = async (c) => {
  const id = c.req.param('id');
  const emoji = c.req.param('emoji');

  const { store, user } = c.var;

  const pubkey = await user!.signer.getPublicKey();

  if (!/^\p{RGI_Emoji}$/v.test(emoji)) {
    return c.json({ error: 'Invalid emoji' }, 400);
  }

  const [event] = await store.query([
    { kinds: [1, 20], ids: [id], limit: 1 },
  ]);

  if (!event) {
    return c.json({ error: 'Status not found' }, 404);
  }

  const events = await store.query([
    { kinds: [7], authors: [pubkey], '#e': [id] },
  ]);

  const tags = events
    .filter((event) => event.content === emoji)
    .map((event) => ['e', event.id]);

  await createEvent(c.var, {
    kind: 5,
    content: '',
    created_at: Math.floor(Date.now() / 1000),
    tags,
  });

  const view = new StatusView(c.var);
  const status = await view.render(event);

  return c.json(status);
};

/**
 * Get an object of emoji to account mappings with accounts that reacted to the post.
 * https://docs.pleroma.social/backend/development/API/pleroma_api/#get-apiv1pleromastatusesidreactions
 */
const reactionsController: AppController = async (c) => {
  const id = c.req.param('id');
  const emoji = c.req.param('emoji') as string | undefined;

  const { store, user } = c.var;

  const pubkey = await user?.signer.getPublicKey();

  if (typeof emoji === 'string' && !/^\p{RGI_Emoji}$/v.test(emoji)) {
    return c.json({ error: 'Invalid emoji' }, 400);
  }

  const events = await store.query([{ kinds: [7], '#e': [id], limit: 100 }])
    .then((events) => events.filter(({ content }) => /^\p{RGI_Emoji}$/v.test(content)))
    .then((events) => events.filter((event) => !emoji || event.content === emoji))
    .then((events) => hydrateEvents(c.var, events));

  /** Events grouped by emoji. */
  const byEmoji = events.reduce((acc, event) => {
    const emoji = event.content;
    acc[emoji] = acc[emoji] || [];
    acc[emoji].push(event);
    return acc;
  }, {} as Record<string, DittoEvent[]>);

  const view = new AccountView(c.var);

  const results = Object.entries(byEmoji).map(([name, events]) => {
    return {
      name,
      count: events.length,
      me: pubkey && events.some((event) => event.pubkey === pubkey),
      accounts: events.map((event) => view.render(event.author, event.pubkey)),
    };
  });

  return c.json(results);
};

export { deleteReactionController, reactionController, reactionsController };
