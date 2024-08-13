import { fetchWorker } from '@/workers/fetch.ts';
import { SimpleLRU } from '@/utils/SimpleLRU.ts';
import { Time } from '@/utils/time.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { unfurlCardCached } from '@/utils/unfurl.ts';

type NodeInfoV1 = {
  usage: {
    users: {
      total: number;
      activeMonth: number;
      activeHalfyear: number;
    };
  };
};

type Domain = string;

export const nodeInfoCache = new SimpleLRU<Domain, NodeInfoV1>(
  async (key, { signal }) => {
    try {
      const url = new URL('/.well-known/nodeinfo', `https://${key}/`);
      const res = await fetchWorker(url, { signal });

      const { links } = await res.json();
      if (links.length < 1) throw new Error(`${key} does not have NodeInfo schemas`);

      // NodeInfo is backwards compatible, and we only care about the 'usage' field,
      // which is present across all versions, so we can make a request to any version
      const urlNodeInfo = links[0].href;

      const resNodeIndo = await fetchWorker(urlNodeInfo, { signal });
      const { usage } = await resNodeIndo.json();

      return {
        usage,
      };
    } catch {
      return {
        usage: {
          users: {
            total: 0,
            activeMonth: 0,
            activeHalfyear: 0,
          },
        },
      };
    }
  },
  { max: 500, ttl: Time.hours(1) },
);

/** Fetches a Ditto Domain by making one network request to
 *  '/.well-known/nodeinfo' and another to root URL (to get OpenGraph data)
 *  'domain' is just a domain, without the HTTPS protocol as prefix */
export async function fetchDittoDomain(domain: string): Promise<DittoTables['ditto_domains'] | undefined> {
  const total_users = (await nodeInfoCache.fetch(domain)).usage.users.total;

  const result = await unfurlCardCached(`https://${domain}`);
  if (!result) {
    return;
  }

  const { title, description, image } = result;

  return {
    domain,
    title,
    description,
    categories: new Set(''),
    image: image ?? '',
    total_users,
  };
}
