import { HTTPException } from '@hono/hono/http-exception';
import { type NostrSigner, NSecSigner } from '@nostrify/nostrify';
import { LRUCache } from 'lru-cache';
import { nip19 } from 'nostr-tools';

import { AppMiddleware } from '@/app.ts';
import { Conf } from '@/config.ts';
import { cachedSignersSizeGauge } from '@/metrics.ts';
import { ConnectSigner } from '@/signers/ConnectSigner.ts';
import { ReadOnlySigner } from '@/signers/ReadOnlySigner.ts';
import { Storages } from '@/storages.ts';
import { aesDecrypt } from '@/utils/aes.ts';
import { getTokenHash } from '@/utils/auth.ts';

const signerCache = new LRUCache<string, NostrSigner>(Conf.caches.signer);

/** Make a `signer` object available to all controllers, or unset if the user isn't logged in. */
export const signerMiddleware: AppMiddleware = async (c, next) => {
  const accessToken = getAccessToken(c.req.raw);

  const cached = accessToken ? signerCache.get(accessToken) : undefined;

  if (cached) {
    c.set('signer', cached);
  } else if (accessToken?.startsWith('token1')) {
    try {
      const kysely = await Storages.kysely();
      const tokenHash = await getTokenHash(accessToken as `token1${string}`);

      const { pubkey, nip46_sk_enc, nip46_relays } = await kysely
        .selectFrom('auth_tokens')
        .select(['pubkey', 'nip46_sk_enc', 'nip46_relays'])
        .where('token_hash', '=', tokenHash)
        .executeTakeFirstOrThrow();

      const nep46Seckey = await aesDecrypt(Conf.seckey, nip46_sk_enc);
      const signer = new ConnectSigner(pubkey, new NSecSigner(nep46Seckey), nip46_relays);

      signerCache.set(accessToken, signer);
      cachedSignersSizeGauge.set(signerCache.size);

      c.set('signer', signer);
    } catch {
      throw new HTTPException(401);
    }
  } else if (accessToken) {
    try {
      const decoded = nip19.decode(accessToken!);

      switch (decoded.type) {
        case 'npub':
          c.set('signer', new ReadOnlySigner(decoded.data));
          break;
        case 'nprofile':
          c.set('signer', new ReadOnlySigner(decoded.data.pubkey));
          break;
        case 'nsec':
          c.set('signer', new NSecSigner(decoded.data));
          break;
      }
    } catch {
      throw new HTTPException(401, { message: 'Invalid access token' });
    }
  }

  await next();
};

/** Extract the access token from the request headers. */
function getAccessToken(req: Request): string | undefined {
  const upgrade = req.headers.get('upgrade');

  // WebSockets use the `sec-websocket-protocol` header instead of `authorization`.
  if (upgrade === 'websocket') {
    return req.headers.get('sec-websocket-protocol') ?? undefined;
  }

  return req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
}
