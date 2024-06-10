import { NIP05, NostrEvent, NSchema as n } from '@nostrify/nostrify';

import { getAuthorFallback } from '@/queries.ts';
import { bech32ToPubkey } from '@/utils.ts';
import { nip05Cache } from '@/utils/nip05.ts';
import { Stickynotes } from '@soapbox/stickynotes';

/** Resolve a bech32 or NIP-05 identifier to an account. */
export async function lookupAccount(
  value: string,
  signal = AbortSignal.timeout(3000),
): Promise<NostrEvent | undefined> {
  const pubkey = await lookupPubkey(value, signal);

  if (pubkey) {
    return getAuthorFallback(pubkey);
  }
}

/** Resolve a bech32 or NIP-05 identifier to a pubkey. */
export async function lookupPubkey(identifier: string, signal?: AbortSignal): Promise<string | undefined> {
  const console = new Stickynotes('ditto:lookup');

  if (n.bech32().safeParse(identifier).success) {
    return bech32ToPubkey(identifier);
  }

  if (NIP05.regex().test(identifier)) {
    try {
      const { pubkey } = await nip05Cache.fetch(identifier, { signal });
      return pubkey;
    } catch (e) {
      console.debug(e);
      return;
    }
  }
}
