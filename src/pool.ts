import { getActiveRelays } from '@/db/relays.ts';
import { type Event, NDK, NDKEvent, NDKRelaySet } from '@/deps.ts';

const activeRelays = await getActiveRelays();

const ndk = new NDK();

/** Publish an event to the given relays, or the entire pool. */
function publish(event: Event, relays: string[] = activeRelays) {
  const relaySet = NDKRelaySet.fromRelayUrls(relays, ndk);
  return new NDKEvent(ndk, event).publish(relaySet);
}

export { activeRelays, ndk, publish };
