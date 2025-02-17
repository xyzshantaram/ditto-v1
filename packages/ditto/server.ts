import { DittoConf } from '@ditto/conf';
import { logi } from '@soapbox/logi';

import { startSentry } from '@/sentry.ts';
import '@/nostr-wasm.ts';
import app from '@/app.ts';

const conf = new DittoConf(Deno.env);

startSentry(conf);

// Ensure the media URL is not on the same host as the local domain.
if (conf.precheck) {
  const { url, mediaDomain } = conf;
  const mediaUrl = new URL(mediaDomain);

  if (url.host === mediaUrl.host) {
    throw new Error(
      'For security reasons, MEDIA_DOMAIN cannot be on the same host as LOCAL_DOMAIN. To disable this check, set DITTO_PRECHECK="false"',
    );
  }
}

Deno.serve({
  port: conf.port,
  onListen({ hostname, port }): void {
    logi({ level: 'info', ns: 'ditto.server', msg: `Listening on http://${hostname}:${port}`, hostname, port });
  },
}, app.fetch);
