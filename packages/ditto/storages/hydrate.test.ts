import { assertEquals } from '@std/assert';

import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { createTestDB, eventFixture } from '@/test.ts';

Deno.test('hydrateEvents(): author --- WITHOUT stats', async () => {
  await using db = await createTestDB();
  const { store } = db;

  const event0 = await eventFixture('event-0');
  const event1 = await eventFixture('event-1');

  // Save events to database
  await store.event(event0);
  await store.event(event1);

  await hydrateEvents(db, [event1]);

  const expectedEvent = { ...event1, author: event0 };
  assertEquals(event1, expectedEvent);
});

Deno.test('hydrateEvents(): repost --- WITHOUT stats', async () => {
  await using db = await createTestDB();
  const { store } = db;

  const event0madePost = await eventFixture('event-0-the-one-who-post-and-users-repost');
  const event0madeRepost = await eventFixture('event-0-the-one-who-repost');
  const event1reposted = await eventFixture('event-1-reposted');
  const event6 = await eventFixture('event-6');

  // Save events to database
  await store.event(event0madePost);
  await store.event(event0madeRepost);
  await store.event(event1reposted);
  await store.event(event6);

  await hydrateEvents(db, [event6]);

  const expectedEvent6 = {
    ...event6,
    author: event0madeRepost,
    repost: { ...event1reposted, author: event0madePost },
  };
  assertEquals(event6, expectedEvent6);
});

Deno.test('hydrateEvents(): quote repost --- WITHOUT stats', async () => {
  await using db = await createTestDB();
  const { store } = db;

  const event0madeQuoteRepost = await eventFixture('event-0-the-one-who-quote-repost');
  const event0 = await eventFixture('event-0');
  const event1quoteRepost = await eventFixture('event-1-quote-repost');
  const event1willBeQuoteReposted = await eventFixture('event-1-that-will-be-quote-reposted');

  // Save events to database
  await store.event(event0madeQuoteRepost);
  await store.event(event0);
  await store.event(event1quoteRepost);
  await store.event(event1willBeQuoteReposted);

  await hydrateEvents(db, [event1quoteRepost]);

  const expectedEvent1quoteRepost = {
    ...event1quoteRepost,
    author: event0madeQuoteRepost,
    quote: { ...event1willBeQuoteReposted, author: event0 },
  };

  assertEquals(event1quoteRepost, expectedEvent1quoteRepost);
});

Deno.test('hydrateEvents(): repost of quote repost --- WITHOUT stats', async () => {
  await using db = await createTestDB();
  const { store } = db;

  const author = await eventFixture('event-0-makes-repost-with-quote-repost');
  const event1 = await eventFixture('event-1-will-be-reposted-with-quote-repost');
  const event6 = await eventFixture('event-6-of-quote-repost');
  const event1quote = await eventFixture('event-1-quote-repost-will-be-reposted');

  // Save events to database
  await store.event(author);
  await store.event(event1);
  await store.event(event1quote);
  await store.event(event6);

  await hydrateEvents(db, [event6]);

  const expectedEvent6 = {
    ...event6,
    author,
    repost: { ...event1quote, author, quote: { author, ...event1 } },
  };
  assertEquals(event6, expectedEvent6);
});

Deno.test('hydrateEvents(): report pubkey and post // kind 1984 --- WITHOUT stats', async () => {
  await using db = await createTestDB();
  const { store } = db;

  const authorDictator = await eventFixture('kind-0-dictator');
  const authorVictim = await eventFixture('kind-0-george-orwell');
  const reportEvent = await eventFixture('kind-1984-dictator-reports-george-orwell');
  const event1 = await eventFixture('kind-1-author-george-orwell');

  // Save events to database
  await store.event(authorDictator);
  await store.event(authorVictim);
  await store.event(reportEvent);
  await store.event(event1);

  await hydrateEvents(db, [reportEvent]);

  const expectedEvent: DittoEvent = {
    ...reportEvent,
    author: authorDictator,
    reported_notes: [event1],
    reported_profile: authorVictim,
  };
  assertEquals(reportEvent, expectedEvent);
});

Deno.test('hydrateEvents(): zap sender, zap amount, zapped post // kind 9735 --- WITHOUT stats', async () => {
  await using db = await createTestDB();
  const { store } = db;

  const zapSender = await eventFixture('kind-0-jack');
  const zapReceipt = await eventFixture('kind-9735-jack-zap-patrick');
  const zappedPost = await eventFixture('kind-1-being-zapped');
  const zapReceiver = await eventFixture('kind-0-patrick');

  // Save events to database
  await store.event(zapSender);
  await store.event(zapReceipt);
  await store.event(zappedPost);
  await store.event(zapReceiver);

  await hydrateEvents(db, [zapReceipt]);

  const expectedEvent: DittoEvent = {
    ...zapReceipt,
    zap_sender: zapSender,
    zapped: {
      ...zappedPost,
      author: zapReceiver,
    },
    zap_amount: 5225000, // millisats
    zap_message: '🫂',
  };
  assertEquals(zapReceipt, expectedEvent);
});
