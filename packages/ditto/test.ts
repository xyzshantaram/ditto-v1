import { DittoConf } from '@ditto/conf';
import { DittoDB } from '@ditto/db';
import ISO6391, { LanguageCode } from 'iso-639-1';
import lande from 'lande';
import { NostrEvent } from '@nostrify/nostrify';
import { finalizeEvent, generateSecretKey, nip19 } from 'nostr-tools';

import { EventsDB } from '@/storages/EventsDB.ts';
import { purifyEvent } from '@/utils/purify.ts';
import { sql } from 'kysely';

/** Import an event fixture by name in tests. */
export async function eventFixture(name: string): Promise<NostrEvent> {
  const result = await import(`~/fixtures/events/${name}.json`, { with: { type: 'json' } });
  return structuredClone(result.default);
}

/** Import a JSONL fixture by name in tests. */
export async function jsonlEvents(path: string): Promise<NostrEvent[]> {
  const data = await Deno.readTextFile(path);
  return data.split('\n').map((line) => JSON.parse(line));
}

/** Generate an event for use in tests. */
export function genEvent(t: Partial<NostrEvent> = {}, sk: Uint8Array = generateSecretKey()): NostrEvent {
  const event = finalizeEvent({
    kind: 255,
    created_at: 0,
    content: '',
    tags: [],
    ...t,
  }, sk);

  return purifyEvent(event);
}

/** Create a database for testing. It uses `DATABASE_URL`, or creates an in-memory database by default. */
export async function createTestDB(opts?: { conf?: DittoConf; pure?: boolean }) {
  const conf = opts?.conf ?? testConf();
  const { kysely } = DittoDB.create(conf.databaseUrl, { poolSize: 1 });

  await DittoDB.migrate(kysely);

  const store = new EventsDB({
    kysely,
    timeout: conf.db.timeouts.default,
    pubkey: conf.pubkey,
    pure: opts?.pure ?? false,
  });

  return {
    conf,
    store,
    kysely,
    [Symbol.asyncDispose]: async () => {
      const { rows } = await sql<
        { tablename: string }
      >`select tablename from pg_tables where schemaname = current_schema()`.execute(kysely);

      for (const { tablename } of rows) {
        if (tablename.startsWith('kysely_')) continue;
        await sql`truncate table ${sql.ref(tablename)} cascade`.execute(kysely);
      }

      await kysely.destroy();
    },
  };
}

export function testConf(): DittoConf {
  const env = new Map<string, string>();

  env.set('DITTO_NSEC', nip19.nsecEncode(generateSecretKey()));
  env.set('LOCAL_DOMAIN', 'https://ditto.test');

  return new DittoConf(env);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getLanguage(text: string): LanguageCode | undefined {
  const [topResult] = lande(text);
  if (topResult) {
    const [iso6393] = topResult;
    const locale = new Intl.Locale(iso6393);
    if (ISO6391.validate(locale.language)) {
      return locale.language;
    }
  }
  return;
}
