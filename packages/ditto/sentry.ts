import { DittoConf } from '@ditto/conf';
import * as Sentry from '@sentry/deno';
import { logi } from '@soapbox/logi';

export function startSentry(conf: DittoConf): void {
  if (conf.sentryDsn) {
    logi({ level: 'info', ns: 'ditto.sentry', msg: 'Sentry enabled.', enabled: true });
    Sentry.init({
      dsn: conf.sentryDsn,
      tracesSampleRate: 1.0,
    });
  } else {
    logi({ level: 'info', ns: 'ditto.sentry', msg: 'Sentry not configured. Skipping.', enabled: false });
  }
}
