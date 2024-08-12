import { fetchWorker } from '@/workers/fetch.ts';
import { SimpleLRU } from '@/utils/SimpleLRU.ts';
import { Time } from '@/utils/time.ts';

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
    } catch (e) {
      throw e;
    }
  },
  { max: 500, ttl: Time.hours(1) },
);
