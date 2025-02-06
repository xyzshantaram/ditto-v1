import { Hono } from '@hono/hono';

import { Conf } from '@/config.ts';
import { requireSigner } from '@/middleware/requireSigner.ts';
import { updateAdminEvent } from '@/utils/api.ts';

const app = new Hono();

app.post('/forfeit', requireSigner, async (c) => {
  const pubkey = await c.get('signer').getPublicKey();

  await updateAdminEvent(
    { kinds: [30382], authors: [Conf.pubkey], '#d': [pubkey], limit: 1 },
    (prev) => {
      const tags = prev?.tags.filter(([name]) => !['ditto.streak.start', 'ditto.streak.end'].includes(name)) ?? [];
      return { ...prev, kind: 30382, tags };
    },
    c,
  );

  return c.newResponse(null, 204);
});

export default app;
