import { DittoConf } from '@ditto/conf';
import { generateSecretKey, nip19 } from 'nostr-tools';

import { PolicyWorker } from '@/workers/policy.ts';
import { assertEquals } from '@std/assert/assert-equals';
import { join } from '@std/path';

const blocked = {
  id: '19afd70437944671e7f5a02b29221ad444ef7cf60113a5731667e272e59a3979',
  pubkey: '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
  kind: 1,
  tags: [['t', 'porn']],
  content: 'this is a test of the policy system #porn',
  sig:
    '1d73a7480cfd737b89dc1e0e7175dff67119915f31d24a279a45d56622f4b991b01e431d07b693ee6cd652f3f27274d9e203ee43ae44af7e70ce8647e5326196',
  created_at: 1743685015,
};

Deno.test('PolicyWorker with script policy', async () => {
  const conf = new DittoConf(
    new Map([
      ['DITTO_NSEC', nip19.nsecEncode(generateSecretKey())],
      ['DITTO_CUSTOM_POLICY', '1'],
      ['DATABASE_URL', Deno.env.get('DATABASE_URL')],
      ['DITTO_POLICY', join(Deno.cwd(), 'fixtures', 'policy.ts')],
    ]),
  );

  const worker = new PolicyWorker(conf);
  const [, , ok] = await worker.call(blocked);
  assertEquals(ok, false);
});

Deno.test('PolicyWorker with event policy', async () => {
  const conf = new DittoConf(
    new Map([
      ['DITTO_NSEC', nip19.nsecEncode(generateSecretKey())],
      ['DATABASE_URL', Deno.env.get('DATABASE_URL')],
    ]),
  );

  const worker = new PolicyWorker(conf);
  const [, , ok] = await worker.call(blocked);

  assertEquals(ok, false);
});
