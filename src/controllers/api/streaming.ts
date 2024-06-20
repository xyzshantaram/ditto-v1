import { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import Debug from '@soapbox/stickynotes/debug';
import { webSocketLimiter } from 'hono-rate-limiter';
import { z } from 'zod';

import { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { DittoDB } from '@/db/DittoDB.ts';
import { MuteListPolicy } from '@/policies/MuteListPolicy.ts';
import { getFeedPubkeys } from '@/queries.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { Storages } from '@/storages.ts';
import { CreateEvents, upgradeWebSocket } from '@/utils/websocket.ts';
import { bech32ToPubkey, Time } from '@/utils.ts';
import { renderReblog, renderStatus } from '@/views/mastodon/statuses.ts';
import { renderNotification } from '@/views/mastodon/notifications.ts';

const debug = Debug('ditto:streaming');

/**
 * Streaming timelines/categories.
 * https://docs.joinmastodon.org/methods/streaming/#streams
 */
const streamSchema = z.enum([
  'public',
  'public:media',
  'public:local',
  'public:local:media',
  'public:remote',
  'public:remote:media',
  'hashtag',
  'hashtag:local',
  'user',
  'user:notification',
  'list',
  'direct',
]);

type Stream = z.infer<typeof streamSchema>;

const limiter = webSocketLimiter({
  windowMs: Time.minutes(1),
  limit: 20,
  keyGenerator: (c) => c.req.header('x-real-ip')!,
});

const streamingController: AppController = async (c) => {
  const upgrade = c.req.header('upgrade');
  const token = c.req.header('sec-websocket-protocol');
  const stream = streamSchema.optional().catch(undefined).parse(c.req.query('stream'));
  const controller = new AbortController();

  if (upgrade?.toLowerCase() !== 'websocket') {
    return c.text('Please use websocket protocol', 400);
  }

  const pubkey = token ? await getTokenPubkey(token) : undefined;
  if (token && !pubkey) {
    return c.json({ error: 'Invalid access token' }, 401);
  }

  const store = await Storages.db();
  const pubsub = await Storages.pubsub();

  const policy = pubkey ? new MuteListPolicy(pubkey, await Storages.admin()) : undefined;

  const createEvents: CreateEvents = () => {
    let socket: WebSocket;

    function send(name: string, payload: object): void {
      if (socket.readyState === WebSocket.OPEN) {
        debug('send', name, JSON.stringify(payload));
        socket.send(JSON.stringify({
          event: name,
          payload: JSON.stringify(payload),
          stream: [stream],
        }));
      }
    }

    async function sub(
      type: string,
      filters: NostrFilter[],
      render: (event: NostrEvent) => Promise<unknown>,
    ): Promise<void> {
      try {
        for await (const msg of pubsub.req(filters, { signal: controller.signal })) {
          if (msg[0] === 'EVENT') {
            const event = msg[2];

            if (policy) {
              const [, , ok] = await policy.call(event);
              if (!ok) {
                continue;
              }
            }

            await hydrateEvents({ events: [event], store, signal: AbortSignal.timeout(1000) });

            const result = await render(event);

            if (result) {
              send(type, result);
            }
          }
        }
      } catch (e) {
        debug('streaming error:', e);
      }
    }

    return {
      async onOpen(_event, ws) {
        socket = ws.raw as WebSocket;

        if (!stream) return;
        const topicFilter = await topicToFilter(stream, c.req.query(), pubkey);

        if (topicFilter) {
          sub('update', [topicFilter], async (event) => {
            if (event.kind === 1) {
              return await renderStatus(event, { viewerPubkey: pubkey });
            }
            if (event.kind === 6) {
              return await renderReblog(event, { viewerPubkey: pubkey });
            }
          });
        }

        if (['user', 'user:notification'].includes(stream) && pubkey) {
          sub('notification', [{ '#p': [pubkey] }], async (event) => {
            return await renderNotification(event, { viewerPubkey: pubkey });
          });
          return;
        }
      },
      onMessage(event, ws) {
        if (typeof event.data !== 'string') {
          ws.close(1003, 'Unsupported data type');
        }
      },
      onClose(_event) {
        controller.abort();
      },
    };
  };

  return upgradeWebSocket(
    c.req.header('x-real-ip') ? limiter(createEvents) : createEvents,
    { protocol: token, idleTimeout: 30 },
  );
};

async function topicToFilter(
  topic: Stream,
  query: Record<string, string>,
  pubkey: string | undefined,
): Promise<NostrFilter | undefined> {
  const { host } = Conf.url;

  switch (topic) {
    case 'public':
      return { kinds: [1, 6] };
    case 'public:local':
      return { kinds: [1, 6], search: `domain:${host}` };
    case 'hashtag':
      if (query.tag) return { kinds: [1, 6], '#t': [query.tag] };
      break;
    case 'hashtag:local':
      if (query.tag) return { kinds: [1, 6], '#t': [query.tag], search: `domain:${host}` };
      break;
    case 'user':
      // HACK: this puts the user's entire contacts list into RAM,
      // and then calls `matchFilters` over it. Refreshing the page
      // is required after following a new user.
      return pubkey ? { kinds: [1, 6], authors: await getFeedPubkeys(pubkey) } : undefined;
  }
}

async function getTokenPubkey(token: string): Promise<string | undefined> {
  if (token.startsWith('token1')) {
    const kysely = await DittoDB.getInstance();

    const { user_pubkey } = await kysely
      .selectFrom('nip46_tokens')
      .select(['user_pubkey', 'server_seckey', 'relays'])
      .where('api_token', '=', token)
      .executeTakeFirstOrThrow();

    return user_pubkey;
  } else {
    return bech32ToPubkey(token);
  }
}

export { streamingController };
