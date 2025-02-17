import { firehoseEventsCounter } from '@ditto/metrics';
import { Semaphore } from '@core/asyncutil';
import { NostrEvent, NRelay } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';

import { nostrNow } from '@/utils.ts';

interface StartFirehoseOpts {
  store: Pick<NRelay, 'req'>;
  kinds?: number[];
  concurrency: number;
}

/**
 * This function watches events on all known relays and performs
 * side-effects based on them, such as trending hashtag tracking
 * and storing events for notifications and the home feed.
 */
export async function startFirehose(
  opts: StartFirehoseOpts,
  onEvent: (event: NostrEvent) => Promise<void> | void,
): Promise<void> {
  const { store, kinds, concurrency } = opts;

  const sem = new Semaphore(concurrency);

  for await (const msg of store.req([{ kinds, limit: 0, since: nostrNow() }])) {
    if (msg[0] === 'EVENT') {
      const event = msg[2];

      logi({ level: 'debug', ns: 'ditto.event', source: 'firehose', id: event.id, kind: event.kind });
      firehoseEventsCounter.inc({ kind: event.kind });

      sem.lock(async () => {
        try {
          await onEvent(event);
        } catch {
          // Ignore
        }
      });
    }
  }
}
