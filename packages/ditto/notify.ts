import { Semaphore } from '@core/asyncutil';
import { DittoDatabase } from '@ditto/db';
import { NStore } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';

import type { DittoConf } from '@ditto/conf';
import type { DittoPipeline } from '@/DittoPipeline.ts';

interface StartNotifyOpts {
  db: DittoDatabase;
  store: NStore;
  conf: DittoConf;
  pipeline: DittoPipeline;
  concurrency?: number;
}

export function startNotify(opts: StartNotifyOpts): void {
  const { conf, db, store, pipeline, concurrency = 1 } = opts;

  const sem = new Semaphore(concurrency);

  db.listen('nostr_event', (id) => {
    if (pipeline.encounters.has(id)) {
      logi({ level: 'debug', ns: 'ditto.notify', id, skipped: true });
      return;
    }

    logi({ level: 'debug', ns: 'ditto.notify', id, skipped: false });

    sem.lock(async () => {
      try {
        const signal = AbortSignal.timeout(conf.db.timeouts.default);

        const [event] = await store.query([{ ids: [id], limit: 1 }], { signal });

        if (event) {
          logi({ level: 'debug', ns: 'ditto.event', source: 'notify', id: event.id, kind: event.kind });
          await pipeline.event(event, { source: 'notify', signal });
        }
      } catch {
        // Ignore
      }
    });
  });
}
