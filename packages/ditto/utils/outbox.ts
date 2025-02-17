import { DittoConf } from '@ditto/conf';
import { NStore } from '@nostrify/nostrify';

export async function getRelays(conf: DittoConf, store: NStore, pubkey: string): Promise<Set<string>> {
  const relays = new Set<`wss://${string}`>();

  const events = await store.query([
    { kinds: [10002], authors: [pubkey, conf.pubkey], limit: 2 },
  ]);

  for (const event of events) {
    for (const [name, relay, marker] of event.tags) {
      if (name === 'r' && (marker === 'write' || !marker)) {
        try {
          const url = new URL(relay);
          if (url.protocol === 'wss:') {
            relays.add(url.toString() as `wss://${string}`);
          }
        } catch (_e) {
          // fall through
        }
      }
    }
  }

  return relays;
}
