import { type Event } from '@/deps.ts';
import { activeRelays, pool } from '@/pool.ts';
import { jsonSchema } from '@/schema.ts';
import { relayEventSchema } from '@/schemas/nostr.ts';
import { nostrNow } from '@/utils.ts';

import * as pipeline from './pipeline.ts';

// This file watches events on all known relays and performs
// side-effects based on them, such as trending hashtag tracking
// and storing events for notifications and the home feed.
const sub = pool.req({
  filtersFn: () => [{ kinds: [0, 1, 3, 5, 6, 7, 10002], limit: 0, since: nostrNow() }],
  relays: activeRelays,
});

sub.addEventListener('message', (event) => {
  const result = jsonSchema.pipe(relayEventSchema).safeParse(event.data);
  if (result.success) {
    const [_cmd, _subId, event] = result.data;
    handleEvent(event);
  }
});

/** Handle events through the firehose pipeline. */
function handleEvent(event: Event): Promise<void> {
  return pipeline
    .handleEvent(event)
    .catch(() => {});
}
