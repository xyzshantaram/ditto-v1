import { DittoConf } from '@ditto/conf';
import { NSchema as n, NStore } from '@nostrify/nostrify';

import { configSchema } from '@/schemas/pleroma-api.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { PleromaConfigDB } from '@/utils/PleromaConfigDB.ts';

interface GetPleromaConfigOpts {
  conf: DittoConf;
  store: NStore;
  signal?: AbortSignal;
}

export async function getPleromaConfigs(opts: GetPleromaConfigOpts): Promise<PleromaConfigDB> {
  const { conf, store, signal } = opts;
  const { pubkey } = conf;

  const [event] = await store.query([{
    kinds: [30078],
    authors: [pubkey],
    '#d': ['pub.ditto.pleroma.config'],
    limit: 1,
  }], { signal });

  if (!event) {
    return new PleromaConfigDB([]);
  }

  try {
    const decrypted = await new AdminSigner(conf).nip44.decrypt(conf.pubkey, event.content);
    const configs = n.json().pipe(configSchema.array()).catch([]).parse(decrypted);
    return new PleromaConfigDB(configs);
  } catch (_e) {
    return new PleromaConfigDB([]);
  }
}
