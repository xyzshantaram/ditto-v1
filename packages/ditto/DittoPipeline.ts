import { type DittoConf } from '@ditto/conf';
import { DittoTables } from '@ditto/db';
import { pipelineEventsCounter, policyEventsCounter, webPushNotificationsCounter } from '@ditto/metrics';
import { NKinds, NostrEvent, NSchema as n, NStore } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';
import { Kysely, UpdateObject } from 'kysely';
import { LRUCache } from 'lru-cache';
import tldts from 'tldts';
import { z } from 'zod';

import { DittoPush } from '@/DittoPush.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { RelayError } from '@/RelayError.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { type EventsDB } from '@/storages/EventsDB.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { eventAge, Time } from '@/utils.ts';
import { getAmount } from '@/utils/bolt11.ts';
import { faviconCache } from '@/utils/favicon.ts';
import { errorJson } from '@/utils/log.ts';
import { resolveNip05 } from '@/utils/nip05.ts';
import { parseNoteContent, stripimeta } from '@/utils/note.ts';
import { purifyEvent } from '@/utils/purify.ts';
import { updateStats } from '@/utils/stats.ts';
import { getTagSet } from '@/utils/tags.ts';
import { unfurlCardCached } from '@/utils/unfurl.ts';
import { renderWebPushNotification } from '@/views/mastodon/push.ts';
import { PolicyWorker } from '@/workers/policy.ts';
import { verifyEventWorker } from '@/workers/verify.ts';

interface PipelineOpts {
  conf: DittoConf;
  kysely: Kysely<DittoTables>;
  store: EventsDB;
  pubsub: NStore;
}

export class DittoPipeline {
  private push: DittoPush;
  private policyWorker: PolicyWorker;

  encounters = new LRUCache<string, true>({ max: 5000 });

  constructor(private opts: PipelineOpts) {
    this.push = new DittoPush(opts);
    this.policyWorker = new PolicyWorker(opts.conf);
  }

  /**
   * Common pipeline function to process (and maybe store) events.
   * It is idempotent, so it can be called multiple times for the same event.
   */
  async event(event: DittoEvent, opts?: { signal: AbortSignal; source?: string }): Promise<void> {
    const { kysely, conf } = this.opts;

    // Skip events that have already been encountered.
    if (this.encounters.get(event.id)) {
      throw new RelayError('duplicate', 'already have this event');
    }
    // Reject events that are too far in the future.
    if (eventAge(event) < -Time.minutes(1)) {
      throw new RelayError('invalid', 'event too far in the future');
    }
    // Integer max value for Postgres.
    if (event.kind >= 2_147_483_647) {
      throw new RelayError('invalid', 'event kind too large');
    }
    // The only point of ephemeral events is to stream them,
    // so throw an error if we're not even going to do that.
    if (NKinds.ephemeral(event.kind) && !this.isFresh(event)) {
      throw new RelayError('invalid', 'event too old');
    }
    // Block NIP-70 events, because we have no way to `AUTH`.
    if (event.tags.some(([name]) => name === '-')) {
      throw new RelayError('invalid', 'protected event');
    }
    // Validate the event's signature.
    if (!(await verifyEventWorker(event))) {
      throw new RelayError('invalid', 'invalid signature');
    }
    // Recheck encountered after async ops.
    if (this.encounters.has(event.id)) {
      throw new RelayError('duplicate', 'already have this event');
    }
    // Set the event as encountered after verifying the signature.
    this.encounters.set(event.id, true);

    // Log the event.
    logi({ level: 'debug', ns: 'ditto.event', source: 'pipeline', id: event.id, kind: event.kind });
    pipelineEventsCounter.inc({ kind: event.kind });

    // NIP-46 events get special treatment.
    // They are exempt from policies and other side-effects, and should be streamed out immediately.
    // If streaming fails, an error should be returned.
    if (event.kind === 24133) {
      await this.streamOut(event);
      return;
    }

    // Ensure the event doesn't violate the policy.
    if (event.pubkey !== conf.pubkey) {
      await this.policyFilter(event, opts?.signal);
    }

    // Prepare the event for additional checks.
    // FIXME: This is kind of hacky. Should be reorganized to fetch only what's needed for each stage.
    await this.hydrateEvent(event, opts?.signal);

    // Ensure that the author is not banned.
    const n = getTagSet(event.user?.tags ?? [], 'n');
    if (n.has('disabled')) {
      throw new RelayError('blocked', 'author is blocked');
    }

    // Ephemeral events must throw if they are not streamed out.
    if (NKinds.ephemeral(event.kind)) {
      await Promise.all([
        this.streamOut(event),
        this.webPush(event),
      ]);
      return;
    }

    // Events received through notify are thought to already be in the database, so they only need to be streamed.
    if (opts?.source === 'notify') {
      await Promise.all([
        this.streamOut(event),
        this.webPush(event),
      ]);
      return;
    }

    try {
      await this.storeEvent(purifyEvent(event), opts?.signal);
    } finally {
      // This needs to run in steps, and should not block the API from responding.
      Promise.allSettled([
        this.handleZaps(kysely, event),
        this.updateAuthorData(event, opts?.signal),
        this.prewarmLinkPreview(event, opts?.signal),
        this.generateSetEvents(event),
      ])
        .then(() =>
          Promise.allSettled([
            this.streamOut(event),
            this.webPush(event),
          ])
        );
    }
  }

  async policyFilter(event: NostrEvent, signal?: AbortSignal): Promise<void> {
    try {
      const result = await this.policyWorker.call(event, signal);
      const [, , ok, reason] = result;
      logi({ level: 'debug', ns: 'ditto.policy', id: event.id, kind: event.kind, ok, reason });
      policyEventsCounter.inc({ ok: String(ok) });
      RelayError.assert(result);
    } catch (e) {
      if (e instanceof RelayError) {
        throw e;
      } else {
        logi({ level: 'error', ns: 'ditto.policy', id: event.id, kind: event.kind, error: errorJson(e) });
        throw new RelayError('blocked', 'policy error');
      }
    }
  }

  /** Hydrate the event with the user, if applicable. */
  async hydrateEvent(event: DittoEvent, signal?: AbortSignal): Promise<void> {
    await hydrateEvents({ ...this.opts, signal }, [event]);
  }

  /** Maybe store the event, if eligible. */
  async storeEvent(event: NostrEvent, signal?: AbortSignal): Promise<undefined> {
    if (NKinds.ephemeral(event.kind)) return;
    const { conf, store } = this.opts;

    try {
      await store.transaction(async (store, kysely) => {
        await updateStats({ conf, store, kysely }, event);
        await store.event(event, { signal });
      });
    } catch (e) {
      // If the failure is only because of updateStats (which runs first), insert the event anyway.
      // We can't catch this in the transaction because the error aborts the transaction on the Postgres side.
      if (e instanceof Error && e.message.includes('event_stats' satisfies keyof DittoTables)) {
        await store.event(event, { signal });
      } else {
        throw e;
      }
    }
  }

  /** Parse kind 0 metadata and track indexes in the database. */
  async updateAuthorData(event: NostrEvent, signal?: AbortSignal): Promise<void> {
    if (event.kind !== 0) return;

    const { conf, kysely, store } = this.opts;

    // Parse metadata.
    const metadata = n.json().pipe(n.metadata()).catch({}).safeParse(event.content);
    if (!metadata.success) return;

    const { name, nip05 } = metadata.data;

    const updates: UpdateObject<DittoTables, 'author_stats'> = {};

    const authorStats = await kysely
      .selectFrom('author_stats')
      .selectAll()
      .where('pubkey', '=', event.pubkey)
      .executeTakeFirst();

    const lastVerified = authorStats?.nip05_last_verified_at;
    const eventNewer = !lastVerified || event.created_at > lastVerified;

    try {
      if (nip05 !== authorStats?.nip05 && eventNewer || !lastVerified) {
        if (nip05) {
          const tld = tldts.parse(nip05);
          if (tld.isIcann && !tld.isIp && !tld.isPrivate) {
            const pointer = await resolveNip05({ conf, store, signal }, nip05.toLowerCase());
            if (pointer.pubkey === event.pubkey) {
              updates.nip05 = nip05;
              updates.nip05_domain = tld.domain;
              updates.nip05_hostname = tld.hostname;
              updates.nip05_last_verified_at = event.created_at;
            }
          }
        } else {
          updates.nip05 = null;
          updates.nip05_domain = null;
          updates.nip05_hostname = null;
          updates.nip05_last_verified_at = event.created_at;
        }
      }
    } catch {
      // Fallthrough.
    }

    // Fetch favicon.
    const domain = nip05?.split('@')[1].toLowerCase();
    if (domain) {
      try {
        await faviconCache.fetch(domain, { signal });
      } catch {
        // Fallthrough.
      }
    }

    const search = [name, nip05].filter(Boolean).join(' ').trim();

    if (search !== authorStats?.search) {
      updates.search = search;
    }

    if (Object.keys(updates).length) {
      await kysely.insertInto('author_stats')
        .values({
          pubkey: event.pubkey,
          followers_count: 0,
          following_count: 0,
          notes_count: 0,
          search,
          ...updates,
        })
        .onConflict((oc) => oc.column('pubkey').doUpdateSet(updates))
        .execute();
    }
  }

  async prewarmLinkPreview(event: NostrEvent, signal?: AbortSignal): Promise<void> {
    const { conf } = this.opts;
    const { firstUrl } = parseNoteContent(conf, stripimeta(event.content, event.tags), []);
    if (firstUrl) {
      await unfurlCardCached(conf, firstUrl, signal);
    }
  }

  /** Determine if the event is being received in a timely manner. */
  isFresh(event: NostrEvent): boolean {
    return eventAge(event) < Time.minutes(1);
  }

  /** Distribute the event through active subscriptions. */
  async streamOut(event: NostrEvent): Promise<void> {
    if (!this.isFresh(event)) {
      throw new RelayError('invalid', 'event too old');
    }

    const { pubsub } = this.opts;

    await pubsub.event(event);
  }

  async webPush(event: NostrEvent): Promise<void> {
    if (!this.isFresh(event)) {
      throw new RelayError('invalid', 'event too old');
    }

    const { kysely } = this.opts;
    const pubkeys = getTagSet(event.tags, 'p');

    if (!pubkeys.size) {
      return;
    }

    const rows = await kysely
      .selectFrom('push_subscriptions')
      .selectAll()
      .where('pubkey', 'in', [...pubkeys])
      .execute();

    for (const row of rows) {
      const viewerPubkey = row.pubkey;

      if (viewerPubkey === event.pubkey) {
        continue; // Don't notify authors about their own events.
      }

      const message = await renderWebPushNotification(event, viewerPubkey);
      if (!message) {
        continue;
      }

      const subscription = {
        endpoint: row.endpoint,
        keys: {
          auth: row.auth,
          p256dh: row.p256dh,
        },
      };

      await this.push.push(subscription, message);
      webPushNotificationsCounter.inc({ type: message.notification_type });
    }
  }

  async generateSetEvents(event: NostrEvent): Promise<void> {
    const { conf } = this.opts;

    const tagsAdmin = event.tags.some(([name, value]) => ['p', 'P'].includes(name) && value === conf.pubkey);

    if (event.kind === 1984 && tagsAdmin) {
      const signer = new AdminSigner(conf);

      const rel = await signer.signEvent({
        kind: 30383,
        content: '',
        tags: [
          ['d', event.id],
          ['p', event.pubkey],
          ['k', '1984'],
          ['n', 'open'],
          ...[...getTagSet(event.tags, 'p')].map((pubkey) => ['P', pubkey]),
          ...[...getTagSet(event.tags, 'e')].map((pubkey) => ['e', pubkey]),
        ],
        created_at: Math.floor(Date.now() / 1000),
      });

      await this.event(rel, { source: 'pipeline', signal: AbortSignal.timeout(1000) });
    }

    if (event.kind === 3036 && tagsAdmin) {
      const signer = new AdminSigner(conf);

      const rel = await signer.signEvent({
        kind: 30383,
        content: '',
        tags: [
          ['d', event.id],
          ['p', event.pubkey],
          ['k', '3036'],
          ['n', 'pending'],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });

      await this.event(rel, { source: 'pipeline', signal: AbortSignal.timeout(1000) });
    }
  }

  /** Stores the event in the 'event_zaps' table */
  async handleZaps(kysely: Kysely<DittoTables>, event: NostrEvent) {
    if (event.kind !== 9735) return;

    const zapRequestString = event?.tags?.find(([name]) => name === 'description')?.[1];
    if (!zapRequestString) return;
    const zapRequest = n.json().pipe(n.event()).optional().catch(undefined).parse(zapRequestString);
    if (!zapRequest) return;

    const amountSchema = z.coerce.number().int().nonnegative().catch(0);
    const amount_millisats = amountSchema.parse(getAmount(event?.tags.find(([name]) => name === 'bolt11')?.[1]));
    if (!amount_millisats || amount_millisats < 1) return;

    const zappedEventId = zapRequest.tags.find(([name]) => name === 'e')?.[1];
    if (!zappedEventId) return;

    try {
      await kysely.insertInto('event_zaps').values({
        receipt_id: event.id,
        target_event_id: zappedEventId,
        sender_pubkey: zapRequest.pubkey,
        amount_millisats,
        comment: zapRequest.content,
      }).execute();
    } catch {
      // receipt_id is unique, do nothing
    }
  }
}
