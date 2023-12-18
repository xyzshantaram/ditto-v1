import { getActiveRelays } from '@/db/relays.ts';
import { type Event, RelayPool } from '@/deps.ts';

const activeRelays = await getActiveRelays();

console.log(`pool: connecting to ${activeRelays.length} relays.`);

const pool = new RelayPool();

/** Publish an event to the given relays, or the entire pool. */
function publish(_event: Event, _relays: string[] = activeRelays) {
  // TODO:
  // return pool.publish(event, relays);
}

export { activeRelays, pool, publish };
