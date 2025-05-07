import { DittoConf } from '@ditto/conf';
import { generateSecretKey, nip19 } from 'nostr-tools';
import { PolicyWorker } from '@/workers/policy.ts';
import { assert, assertEquals } from '@std/assert';
import { join } from '@std/path';
import { createPolicyEvent } from '../utils/policies/mod.ts';
import { createTestDB } from '../test.ts';

const blocked = {
  id: '19afd70437944671e7f5a02b29221ad444ef7cf60113a5731667e272e59a3979',
  pubkey: '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
  kind: 1,
  tags: [['t', 'potato'], ['t', 'tomato']],
  content: 'this is a test of the policy system',
  sig:
    '1d73a7480cfd737b89dc1e0e7175dff67119915f31d24a279a45d56622f4b991b01e431d07b693ee6cd652f3f27274d9e203ee43ae44af7e70ce8647e5326196',
  created_at: 1743685015,
};

Deno.test('Tests for policy workers', async (t) => {
  const nsec = nip19.nsecEncode(generateSecretKey());
  const env = new Map([
    ['DITTO_NSEC', nsec],
    ['DATABASE_URL', Deno.env.get('DATABASE_URL')],
  ]);

  await using db = await createTestDB();

  async function clearPolicyEvents() {
    await db.store.remove([{ kinds: [11984] }]);
  }
  await clearPolicyEvents();

  await t.step('No DITTO_POLICY, no event-based policy (default allow)', async () => {
    await clearPolicyEvents();
    const conf = new DittoConf(env);

    const worker = new PolicyWorker(conf);
    const [, , ok] = await worker.call(blocked);

    assertEquals(ok, true, 'Should not block anything in default config');
  });

  // Edge 2: No DITTO_POLICY, valid event-based policy (blocks "tomato")
  await t.step('No DITTO_POLICY, valid event-based policy (blocks "tomato")', async () => {
    await clearPolicyEvents();
    const conf = new DittoConf(env);

    await db.store.event(
      await createPolicyEvent(conf, {
        policies: [
          { 'name': 'HashtagPolicy', 'params': { 'hashtags': ['tomato'] } },
        ],
      }),
    );

    using worker = new PolicyWorker(conf);
    const [, , ok] = await worker.call(blocked);

    assert(!ok, 'Event policy should block events with #tomato');
  });

  // Edge 3: DITTO_POLICY set but policy script is missing (should fallback)
  await t.step('DITTO_POLICY set but file is missing (should fallback)', async () => {
    await clearPolicyEvents();

    const thisEnv = new Map([...env, ['DITTO_POLICY', 'not-a-policy.ts']]);
    const conf = new DittoConf(thisEnv);

    using worker = new PolicyWorker(conf);
    const [, , ok] = await worker.call(blocked);

    assertEquals(
      ok,
      true,
      'Missing script policy should fall back to allowing (default policy)',
    );
  });

  await t.step('Both DITTO_POLICY and event policy', async () => {
    await clearPolicyEvents();

    const policyScriptPath = join(Deno.cwd(), 'fixtures', 'policy.ts');
    const thisEnv = new Map([...env, ['DITTO_POLICY', policyScriptPath]]);
    const conf = new DittoConf(thisEnv);

    await db.store.event(
      await createPolicyEvent(conf, {
        policies: [
          { 'name': 'HashtagPolicy', 'params': { 'hashtags': ['tomato'] } },
        ],
      }),
    );

    using worker = new PolicyWorker(conf);
    const [, , ok] = await worker.call(blocked);

    assert(
      !ok,
      'Both script and event-based policy are present: event should be blocked if either blocks',
    );
  });
});
