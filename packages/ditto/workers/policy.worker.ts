import { DittoConf } from '@ditto/conf';
import { DittoPolyPg } from '@ditto/db';
import '@soapbox/safe-fetch/load';
import { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/nostrify';
import { PipePolicy, ReadOnlyPolicy } from '@nostrify/policies';
import * as Comlink from 'comlink';

import { ReadOnlySigner } from '@/signers/ReadOnlySigner.ts';
import { DittoPgStore } from '@/storages/DittoPgStore.ts';
import { DEFAULT_POLICY_SPEC, PolicyRegistry, PolicySpec } from '@/utils/policies/mod.ts';
import { logi } from '@soapbox/logi';

// @ts-ignore Don't try to access the env from this worker.
Deno.env = new Map<string, string>();

interface PolicyInit {
  /** Database URL to connect to. */
  databaseUrl: string;
  /** Admin pubkey to use for DittoPgStore checks. */
  pubkey: string;
  path: string;
}

export class CustomPolicy implements NPolicy {
  private policy: NPolicy = new ReadOnlyPolicy();
  registryKv: Deno.Kv | undefined;

  // deno-lint-ignore require-await
  async call(event: NostrEvent, signal?: AbortSignal): Promise<NostrRelayOK> {
    return this.policy.call(event, signal);
  }

  async init(opts: PolicyInit): Promise<void> {
    const { databaseUrl, pubkey } = opts;

    const db = new DittoPolyPg(databaseUrl, { poolSize: 1 });

    const conf = new Proxy(new DittoConf(new Map()), {
      get(target, prop) {
        if (prop === 'signer') {
          return new ReadOnlySigner(pubkey);
        }
        return Reflect.get(target, prop);
      },
    });

    const policies: NPolicy[] = [];
    const store = new DittoPgStore({
      db,
      conf,
      timeout: 5_000,
    });
    try {
      const Policy = (await import(opts.path)).default;
      policies.push(new Policy({ db, store, pubkey }));
    } catch (e) {
      if (e instanceof Error && e.message.includes('Module not found')) {
        logi({
          level: 'info',
          ns: 'ditto.system.policy',
          msg: 'Custom policy not found <https://docs.soapbox.pub/ditto/policies/>',
          path: null,
        });
      }
    }
    this.registryKv = await Deno.openKv();
    const registry = new PolicyRegistry({ store, antiDuplicationPolicyStore: this.registryKv });
    const event = await store
      .query([{ kinds: [11984], authors: [await conf.signer.getPublicKey()] }])
      .then((results) => results[0]);

    const spec: PolicySpec = event ? JSON.parse(event.content) : DEFAULT_POLICY_SPEC;

    for (const item of spec.policies) {
      const policy = registry.available[item.name];
      if (!policy) continue;
      try {
        policies.push(policy.instantiate(item.params || {}));
      } catch (e) {
        logi({
          level: 'error',
          ns: 'ditto.system.policy.worker',
          msg: `Error instantiating policy ${item.name} with params \`${JSON.stringify(item.params)}\`: ${e}`,
        });
      }
    }

    this.policy = new PipePolicy(policies);
  }

  close() {
    this.registryKv?.close();
    self.close();
  }
}

Comlink.expose(new CustomPolicy());
