import {
  NostrClientCLOSE,
  NostrClientCOUNT,
  NostrClientEVENT,
  NostrClientMsg,
  NostrClientREQ,
  NostrRelayMsg,
  NSchema as n,
} from '@nostrify/nostrify';

import { AppController } from '@/app.ts';
import { relayInfoController } from '@/controllers/nostr/relay-info.ts';
import * as pipeline from '@/pipeline.ts';
import { RelayError } from '@/RelayError.ts';
import { Storages } from '@/storages.ts';

/** Limit of initial events returned for a subscription. */
const FILTER_LIMIT = 100;

/** Maximum number of connections per IP. */
const MAX_CONNECTIONS = 3;

/** Map of IP addresses to connection counts. */
const connections = new Map<string, number>();

/** Set up the Websocket connection. */
function connectStream(socket: WebSocket, ip?: string) {
  const controllers = new Map<string, AbortController>();
  const count = ip ? connections.get(ip) ?? 0 : 0;

  socket.onopen = () => {
    if (ip) {
      connections.set(ip, count + 1);
    }
  };

  socket.onmessage = (e) => {
    const result = n.json().pipe(n.clientMsg()).safeParse(e.data);
    if (result.success) {
      handleMsg(result.data);
    } else {
      send(['NOTICE', 'Invalid message.']);
    }
  };

  socket.onclose = () => {
    for (const controller of controllers.values()) {
      controller.abort();
    }

    if (ip) {
      const next = count - 1;
      if (next <= 0) {
        connections.delete(ip);
      } else {
        connections.set(ip, next);
      }
    }
  };

  /** Handle client message. */
  function handleMsg(msg: NostrClientMsg) {
    switch (msg[0]) {
      case 'REQ':
        handleReq(msg);
        return;
      case 'EVENT':
        handleEvent(msg);
        return;
      case 'CLOSE':
        handleClose(msg);
        return;
      case 'COUNT':
        handleCount(msg);
        return;
    }
  }

  /** Handle REQ. Start a subscription. */
  async function handleReq([_, subId, ...filters]: NostrClientREQ): Promise<void> {
    const controller = new AbortController();
    controllers.get(subId)?.abort();
    controllers.set(subId, controller);

    const store = await Storages.db();
    const pubsub = await Storages.pubsub();

    try {
      for (const event of await store.query(filters, { limit: FILTER_LIMIT })) {
        send(['EVENT', subId, event]);
      }
    } catch (e) {
      send(['CLOSED', subId, e.message]);
      controllers.delete(subId);
      return;
    }

    send(['EOSE', subId]);

    try {
      for await (const msg of pubsub.req(filters, { signal: controller.signal })) {
        if (msg[0] === 'EVENT') {
          send(['EVENT', subId, msg[2]]);
        }
      }
    } catch (_e) {
      controllers.delete(subId);
    }
  }

  /** Handle EVENT. Store the event. */
  async function handleEvent([_, event]: NostrClientEVENT): Promise<void> {
    try {
      // This will store it (if eligible) and run other side-effects.
      await pipeline.handleEvent(event, AbortSignal.timeout(1000));
      send(['OK', event.id, true, '']);
    } catch (e) {
      if (e instanceof RelayError) {
        send(['OK', event.id, false, e.message]);
      } else {
        send(['OK', event.id, false, 'error: something went wrong']);
        console.error(e);
      }
    }
  }

  /** Handle CLOSE. Close the subscription. */
  function handleClose([_, subId]: NostrClientCLOSE): void {
    const controller = controllers.get(subId);
    if (controller) {
      controller.abort();
      controllers.delete(subId);
    }
  }

  /** Handle COUNT. Return the number of events matching the filters. */
  async function handleCount([_, subId, ...filters]: NostrClientCOUNT): Promise<void> {
    const store = await Storages.db();
    const { count } = await store.count(filters);
    send(['COUNT', subId, { count, approximate: false }]);
  }

  /** Send a message back to the client. */
  function send(msg: NostrRelayMsg): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }
}

const relayController: AppController = (c, next) => {
  const upgrade = c.req.header('upgrade');

  // NIP-11: https://github.com/nostr-protocol/nips/blob/master/11.md
  if (c.req.header('accept') === 'application/nostr+json') {
    return relayInfoController(c, next);
  }

  if (upgrade?.toLowerCase() !== 'websocket') {
    return c.text('Please use a Nostr client to connect.', 400);
  }

  const ip = c.req.header('x-real-ip');
  if (ip) {
    const count = connections.get(ip) ?? 0;
    if (count >= MAX_CONNECTIONS) {
      return c.text('Too many connections.', 429);
    }
  }

  const { socket, response } = Deno.upgradeWebSocket(c.req.raw, { idleTimeout: 30 });
  connectStream(socket, ip);

  return response;
};

export { relayController };
