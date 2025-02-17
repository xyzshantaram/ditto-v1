import { type DittoConf } from '@ditto/conf';
import { NostrEvent, NostrMetadata, NSchema as n, NStore } from '@nostrify/nostrify';
import { z } from 'zod';

import { screenshotsSchema, serverMetaSchema } from '@/schemas/nostr.ts';

/** Like NostrMetadata, but some fields are required and also contains some extra fields. */
export interface InstanceMetadata extends NostrMetadata {
  about: string;
  email: string;
  name: string;
  picture: string;
  tagline: string;
  event?: NostrEvent;
  screenshots: z.infer<typeof screenshotsSchema>;
}

/** Get and parse instance metadata from the kind 0 of the admin user. */
export async function getInstanceMetadata(
  opts: { conf: DittoConf; store: NStore; signal?: AbortSignal },
): Promise<InstanceMetadata> {
  const { conf, store, signal } = opts;

  const [event] = await store.query(
    [{ kinds: [0], authors: [conf.pubkey], limit: 1 }],
    { signal },
  );

  const meta = n
    .json()
    .pipe(serverMetaSchema)
    .catch({})
    .parse(event?.content);

  return {
    ...meta,
    name: meta.name ?? 'Ditto',
    about: meta.about ?? 'Nostr community server',
    tagline: meta.tagline ?? meta.about ?? 'Nostr community server',
    email: meta.email ?? `postmaster@${conf.url.host}`,
    picture: meta.picture ?? conf.local('/images/thumbnail.png'),
    event,
    screenshots: meta.screenshots ?? [],
  };
}
