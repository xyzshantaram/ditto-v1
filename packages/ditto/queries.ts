import { DittoConf } from '@ditto/conf';
import { DittoTables } from '@ditto/db';
import { NostrEvent, NostrFilter, NStore } from '@nostrify/nostrify';
import { Kysely } from 'kysely';

import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { fallbackAuthor } from '@/utils.ts';
import { findReplyTag, getTagSet } from '@/utils/tags.ts';

interface GetEventOpts {
  conf: DittoConf;
  store: NStore;
  kysely: Kysely<DittoTables>;
  signal?: AbortSignal;
}

/** Get a Nostr event by its ID. */
async function getEvent(opts: GetEventOpts, id: string): Promise<DittoEvent | undefined> {
  const { store, signal } = opts;

  const filter: NostrFilter = { ids: [id], limit: 1 };

  return await store.query([{ ...filter, limit: 1 }], { signal })
    .then((events) => hydrateEvents(opts, events))
    .then(([event]) => event);
}

/** Get a Nostr `set_medatadata` event for a user's pubkey. */
async function getAuthor(opts: GetEventOpts, pubkey: string): Promise<NostrEvent | undefined> {
  const { store, signal } = opts;

  const events = await store.query([{ authors: [pubkey], kinds: [0], limit: 1 }], { signal });
  const event = events[0] ?? fallbackAuthor(pubkey);

  await hydrateEvents(opts, [event]);

  return event;
}

/** Get users the given pubkey follows. */
async function getFollows(opts: GetEventOpts, pubkey: string): Promise<NostrEvent | undefined> {
  const { store, signal } = opts;
  const [event] = await store.query([{ authors: [pubkey], kinds: [3], limit: 1 }], { signal });
  return event;
}

/** Get pubkeys the user follows. */
async function getFollowedPubkeys(opts: GetEventOpts, pubkey: string): Promise<Set<string>> {
  const event = await getFollows(opts, pubkey);
  if (!event) return new Set();
  return getTagSet(event.tags, 'p');
}

/** Get pubkeys the user follows, including the user's own pubkey. */
async function getFeedPubkeys(opts: GetEventOpts, pubkey: string): Promise<Set<string>> {
  const authors = await getFollowedPubkeys(opts, pubkey);
  return authors.add(pubkey);
}

async function getAncestors(store: NStore, event: NostrEvent, result: NostrEvent[] = []): Promise<NostrEvent[]> {
  if (result.length < 100) {
    const replyTag = findReplyTag(event.tags);
    const inReplyTo = replyTag ? replyTag[1] : undefined;

    if (inReplyTo) {
      const [parentEvent] = await store.query([{ ids: [inReplyTo], until: event.created_at, limit: 1 }]);

      if (parentEvent) {
        result.push(parentEvent);
        return getAncestors(store, parentEvent, result);
      }
    }
  }

  return result.reverse();
}

async function getDescendants(
  store: NStore,
  event: NostrEvent,
  signal = AbortSignal.timeout(2000),
): Promise<NostrEvent[]> {
  return await store
    .query([{ kinds: [1], '#e': [event.id], since: event.created_at, limit: 200 }], { signal })
    .then((events) => events.filter(({ tags }) => findReplyTag(tags)?.[1] === event.id));
}

/** Returns whether the pubkey is followed by a local user. */
async function isLocallyFollowed(conf: DittoConf, store: NStore, pubkey: string): Promise<boolean> {
  const { host } = conf.url;

  const [event] = await store.query(
    [{ kinds: [3], '#p': [pubkey], search: `domain:${host}`, limit: 1 }],
  );

  return Boolean(event);
}

export {
  getAncestors,
  getAuthor,
  getDescendants,
  getEvent,
  getFeedPubkeys,
  getFollowedPubkeys,
  getFollows,
  isLocallyFollowed,
};
