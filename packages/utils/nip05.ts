import { cachedNip05sSizeGauge } from '@ditto/metrics';
import { NIP05, NStore } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';
import { safeFetch } from '@soapbox/safe-fetch';
import { nip19 } from 'nostr-tools';
import tldts from 'tldts';

import { errorJson } from './log.ts';
import { SimpleLRU } from './SimpleLRU.ts';
import { DittoConf } from '../conf/mod.ts';

let nip05Cache: SimpleLRU<string, nip19.ProfilePointer> | undefined;

interface ResolveNip05Opts {
  conf: DittoConf;
  store: NStore;
  signal?: AbortSignal;
}

export function resolveNip05(opts: ResolveNip05Opts, nip05: string): Promise<nip19.ProfilePointer> {
  const { conf } = opts;

  if (!nip05Cache) {
    nip05Cache = new SimpleLRU<string, nip19.ProfilePointer>(
      async (nip05, { signal }) => {
        return await getNip05({ ...opts, signal }, nip05);
      },
      { ...conf.caches.nip05, gauge: cachedNip05sSizeGauge },
    );
  }

  return nip05Cache.fetch(nip05, opts);
}

async function getNip05(
  opts: ResolveNip05Opts,
  nip05: string,
): Promise<nip19.ProfilePointer> {
  const { conf, signal } = opts;
  const tld = tldts.parse(nip05);

  if (!tld.isIcann || tld.isIp || tld.isPrivate) {
    throw new Error(`Invalid NIP-05: ${nip05}`);
  }

  logi({ level: 'info', ns: 'ditto.nip05', nip05, state: 'started' });

  const [name, domain] = nip05.split('@');

  try {
    if (domain === conf.url.host) {
      const pointer = await localNip05Lookup(opts, name);
      if (pointer) {
        logi({ level: 'info', ns: 'ditto.nip05', nip05, state: 'found', source: 'local', pubkey: pointer.pubkey });
        return pointer;
      } else {
        throw new Error(`Not found: ${nip05}`);
      }
    } else {
      const pointer = await NIP05.lookup(nip05, { fetch: safeFetch, signal });
      logi({ level: 'info', ns: 'ditto.nip05', nip05, state: 'found', source: 'fetch', pubkey: pointer.pubkey });
      return pointer;
    }
  } catch (e) {
    logi({ level: 'info', ns: 'ditto.nip05', nip05, state: 'failed', error: errorJson(e) });
    throw e;
  }
}

export async function localNip05Lookup(
  opts: ResolveNip05Opts,
  localpart: string,
): Promise<nip19.ProfilePointer | undefined> {
  const { conf, store } = opts;

  const [grant] = await store.query([{
    kinds: [30360],
    '#d': [`${localpart}@${conf.url.host}`],
    authors: [conf.pubkey],
    limit: 1,
  }]);

  const pubkey = grant?.tags.find(([name]) => name === 'p')?.[1];

  if (pubkey) {
    return { pubkey, relays: [conf.relay] };
  }
}
