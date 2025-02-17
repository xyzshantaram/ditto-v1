import { DittoConf } from '@ditto/conf';
import { DittoTables } from '@ditto/db';
import { logi } from '@soapbox/logi';
import { Kysely } from 'kysely';

import { AppMiddleware } from '@/app.ts';
import { getPathParams, MetadataEntities } from '../../utils/og-metadata.ts';
import { getInstanceMetadata } from '../../utils/instance.ts';
import { errorJson } from '../../utils/log.ts';
import { lookupPubkey } from '../../utils/lookup.ts';
import { renderMetadata } from '@/views/meta.ts';
import { getAuthor, getEvent } from '@/queries.ts';
import { StatusView } from '@/views/mastodon/StatusView.ts';
import { AccountView } from '@/views/mastodon/AccountView.ts';
import { NStore } from '@nostrify/types';

/** Placeholder to find & replace with metadata. */
const META_PLACEHOLDER = '<!--server-generated-meta-->' as const;

export const frontendController: AppMiddleware = async (c) => {
  const { conf } = c.var;

  c.header('Cache-Control', 'max-age=86400, s-maxage=30, public, stale-if-error=604800');

  try {
    const content = await Deno.readTextFile(new URL('../../../public/index.html', import.meta.url));

    if (content.includes(META_PLACEHOLDER)) {
      const params = getPathParams(c.req.path);
      try {
        const entities = await getEntities(c.var, params ?? {});
        const meta = renderMetadata(conf, c.req.raw, entities);
        return c.html(content.replace(META_PLACEHOLDER, meta));
      } catch (e) {
        logi({ level: 'error', ns: 'ditto.frontend', msg: 'Error building meta tags', error: errorJson(e) });
        return c.html(content);
      }
    }
    return c.html(content);
  } catch {
    return c.notFound();
  }
};

interface GetEntitiesOpts {
  conf: DittoConf;
  store: NStore;
  kysely: Kysely<DittoTables>;
  signal?: AbortSignal;
}

async function getEntities(
  opts: GetEntitiesOpts,
  params: { acct?: string; statusId?: string },
): Promise<MetadataEntities> {
  const entities: MetadataEntities = {
    instance: await getInstanceMetadata(opts),
  };

  if (params.statusId) {
    const event = await getEvent(opts, params.statusId);

    if (event) {
      const view = new StatusView(opts);
      entities.status = await view.render(event);
      entities.account = entities.status?.account;
    }
    return entities;
  }

  if (params.acct) {
    const pubkey = await lookupPubkey(opts, params.acct.replace(/^@/, ''));
    const event = pubkey ? await getAuthor(opts, pubkey) : undefined;

    if (event) {
      const view = new AccountView(opts);
      entities.account = view.render(event);
    }
  }

  return entities;
}
