import { aesDecrypt, getTokenHash } from '@ditto/auth';
import { ConnectSigner, ReadOnlySigner } from '@ditto/signers';
import { HTTPException } from '@hono/hono/http-exception';
import { type NostrSigner, NSecSigner, type NStore } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import type { DittoMiddleware } from '../DittoMiddleware.ts';

interface User {
  signer: NostrSigner;
  relay: NStore;
}

// @ts-ignore The types are right.
export function userMiddleware(opts: { privileged: false; required: true }): DittoMiddleware<{ user: User }>;
export function userMiddleware(opts: { privileged: true; required?: boolean }): DittoMiddleware<{ user: User }>;
export function userMiddleware(opts: { privileged: false; required?: boolean }): DittoMiddleware<{ user?: User }>;
export function userMiddleware(opts: { privileged: boolean; required?: boolean }): DittoMiddleware<{ user?: User }> {
  /** We only accept "Bearer" type. */
  const BEARER_REGEX = new RegExp(`^Bearer (${nip19.BECH32_REGEX.source})$`);

  const { privileged, required = false } = opts;

  return async (c, next) => {
    const { conf, db, relay } = c.var;

    const header = c.req.header('authorization');
    const match = header?.match(BEARER_REGEX);

    let signer: NostrSigner | undefined;

    if (match) {
      const [_, bech32] = match;

      if (bech32.startsWith('token1')) {
        try {
          const tokenHash = await getTokenHash(bech32 as `token1${string}`);

          const { pubkey: userPubkey, bunker_pubkey: bunkerPubkey, nip46_sk_enc, nip46_relays } = await db.kysely
            .selectFrom('auth_tokens')
            .select(['pubkey', 'bunker_pubkey', 'nip46_sk_enc', 'nip46_relays'])
            .where('token_hash', '=', tokenHash)
            .executeTakeFirstOrThrow();

          const nep46Seckey = await aesDecrypt(conf.seckey, nip46_sk_enc);

          signer = new ConnectSigner({
            bunkerPubkey,
            userPubkey,
            signer: new NSecSigner(nep46Seckey),
            relays: nip46_relays,
            relay,
          });
        } catch {
          throw new HTTPException(401);
        }
      } else {
        try {
          const decoded = nip19.decode(bech32!);

          switch (decoded.type) {
            case 'npub':
              signer = new ReadOnlySigner(decoded.data);
              break;
            case 'nprofile':
              signer = new ReadOnlySigner(decoded.data.pubkey);
              break;
            case 'nsec':
              signer = new NSecSigner(decoded.data);
              break;
          }
        } catch {
          throw new HTTPException(401);
        }
      }
    }

    if (signer) {
      const user: User = { signer, relay };
      c.set('user', user);
    } else if (privileged || required) {
      throw new HTTPException(401);
    }

    await next();
  };
}
