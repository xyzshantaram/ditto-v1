import { Context, MiddlewareHandler } from '@hono/hono';
import { WSContext, WSEvents, WSReadyState } from '@hono/hono/ws';

export type CreateEvents = (c: Context) => WSEvents | Promise<WSEvents>;

export type UpgradeWebSocket = (
  createEvents: CreateEvents,
  options?: Deno.UpgradeWebSocketOptions,
) => MiddlewareHandler<
  any,
  string,
  {
    outputFormat: 'ws';
  }
>;

/**
 * A modified version of Hono's WebSocket Helper, just to support Deno's `options` object.
 *
 * See: https://github.com/honojs/hono/issues/2997
 *
 * (If that issue gets fixed, we can remove this code.)
 */
export const upgradeWebSocket: UpgradeWebSocket = (createEvents, options) => async (c, next) => {
  if (c.req.header('upgrade') !== 'websocket') {
    return await next();
  }

  const events = await createEvents(c);
  const { response, socket } = Deno.upgradeWebSocket(c.req.raw, options);

  const wsContext: WSContext = {
    binaryType: 'arraybuffer',
    close: (code, reason) => socket.close(code, reason),
    get protocol() {
      return socket.protocol;
    },
    raw: socket,
    get readyState() {
      return socket.readyState as WSReadyState;
    },
    url: socket.url ? new URL(socket.url) : null,
    send: (source) => socket.send(source),
  };
  socket.onopen = (evt) => events.onOpen?.(evt, wsContext);
  socket.onmessage = (evt) => events.onMessage?.(evt, wsContext);
  socket.onclose = (evt) => events.onClose?.(evt, wsContext);
  socket.onerror = (evt) => events.onError?.(evt, wsContext);

  return response;
};
