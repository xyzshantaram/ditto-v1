import { createTestDB, eventFixture } from '@/test.ts';
import { getRelays } from '@/utils/outbox.ts';
import { assertEquals } from '@std/assert';

Deno.test('Get write relays - kind 10002', async () => {
  await using db = await createTestDB();
  const { conf, store } = db;

  const relayListMetadata = await eventFixture('kind-10002-alex');

  await store.event(relayListMetadata);

  const relays = await getRelays(conf, store, relayListMetadata.pubkey);

  assertEquals(relays.size, 6);
});

Deno.test('Get write relays with invalid URL - kind 10002', async () => {
  await using db = await createTestDB();
  const { conf, store } = db;

  const relayListMetadata = await eventFixture('kind-10002-alex');
  relayListMetadata.tags[0] = ['r', 'yolo'];

  await store.event(relayListMetadata);

  const relays = await getRelays(conf, store, relayListMetadata.pubkey);

  assertEquals(relays.size, 5);
});
