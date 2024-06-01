import { z } from 'zod';

import { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { Storages } from '@/storages.ts';
import { createAdminEvent } from '@/utils/api.ts';

const revokeNip05Schema = z.object({
  nip05: z.string().email(),
});

export const revokeNip05Controller: AppController = async (c) => {
  const store = await Storages.db();
  const params = revokeNip05Schema.parse(c.req.json());

  const [event] = await store.query([
    { kinds: [1985], authors: [Conf.pubkey], '#L': ['nip05'], '#l': [params.nip05], limit: 1 },
  ]);

  if (!event) {
    return c.json({ error: 'No NIP-05 found' }, 404);
  }

  await createAdminEvent({
    kind: 5,
    tags: [['e', event.id]],
  }, c);

  return c.json({});
};
