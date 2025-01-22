import { NostrEvent } from '@nostrify/nostrify';
import { Stickynotes } from '@soapbox/stickynotes';

import { pipelineEncounters } from '@/caches/pipelineEncounters.ts';
import { Conf } from '@/config.ts';
import * as pipeline from '@/pipeline.ts';
import { Storages } from '@/storages.ts';
import { AsyncBatcher } from '@/utils/AsyncBatcher.ts';

const console = new Stickynotes('ditto:notify');

const batcher = new AsyncBatcher<string, NostrEvent | undefined>(
  async (ids) => {
    const store = await Storages.db();
    const signal = AbortSignal.timeout(Conf.db.timeouts.default);
    const events = await store.query([{ ids }], { signal });
    return ids.map((id) => events.find((e) => e.id === id));
  },
);

export async function startNotify(): Promise<void> {
  const { listen } = await Storages.database();

  listen('nostr_event', async (id) => {
    if (pipelineEncounters.has(id)) {
      console.debug(`Skip event ${id} because it was already in the pipeline`);
      return;
    }

    try {
      const signal = AbortSignal.timeout(Conf.db.timeouts.default);
      const event = await batcher.add(id);

      if (event) {
        await pipeline.handleEvent(event, { source: 'notify', signal });
      }
    } catch (e) {
      console.warn(e);
    }
  });
}
