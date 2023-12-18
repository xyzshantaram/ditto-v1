import { type Event, NDKRelaySet } from '@/deps.ts';
import { activeRelays, ndk } from '@/pool.ts';
import { nostrNow } from '@/utils.ts';

import * as pipeline from './pipeline.ts';

console.log(`pool: connecting to ${activeRelays.length} relays.`);

// This file watches events on all known relays and performs
// side-effects based on them, such as trending hashtag tracking
// and storing events for notifications and the home feed.
const sub = ndk.subscribe(
  [{ kinds: [0, 1, 3, 5, 6, 7, 10002], limit: 0, since: nostrNow() }],
  {},
  NDKRelaySet.fromRelayUrls(activeRelays, ndk),
);

sub.on('event', handleEvent);

/** Handle events through the firehose pipeline. */
function handleEvent(event: Event): Promise<void> {
  console.info(`firehose: Event<${event.kind}> ${event.id}`);

  return pipeline
    .handleEvent(event)
    .catch(() => {});
}
