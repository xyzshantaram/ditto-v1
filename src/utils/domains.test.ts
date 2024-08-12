import { nodeInfoCache } from '@/utils/domains.ts';
import { assert, assertObjectMatch } from '@std/assert';

Deno.test('NodeInfo request in gleasonator.dev', { sanitizeResources: false }, async () => {
  const result = await nodeInfoCache.fetch('gleasonator.dev', {
    signal: AbortSignal.timeout(5000),
  });

  assertObjectMatch(result, {
    usage: {
      users: {},
    },
  });

  assert(
    'total' in result.usage.users &&
      typeof result.usage.users.total === 'number',
  );
  assert(
    'activeMonth' in result.usage.users &&
      typeof result.usage.users.activeMonth === 'number',
  );
  assert(
    'activeHalfyear' in result.usage.users &&
      typeof result.usage.users.activeHalfyear === 'number',
  );
});
