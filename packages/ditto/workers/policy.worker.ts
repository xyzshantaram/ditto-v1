import { DittoConf } from '@ditto/conf';
import { DittoPolyPg } from '@ditto/db';
import '@soapbox/safe-fetch/load';
import { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/nostrify';
import { PipePolicy, PolicyRegistry, ReadOnlyPolicy } from '@nostrify/policies';
import * as Comlink from 'comlink';

import { ReadOnlySigner } from '@/signers/ReadOnlySigner.ts';
import { DittoPgStore } from '@/storages/DittoPgStore.ts';
import { DEFAULT_POLICY_SPEC, PolicySpec } from '@/utils/policies.ts';

// @ts-ignore Don't try to access the env from this worker.
Deno.env = new Map<string, string>();

interface PolicyInitCommon {
  /** Database URL to connect to. */
  databaseUrl: string;
  /** Admin pubkey to use for DittoPgStore checks. */
  pubkey: string;
  mode: 'script' | 'event';
}

interface ScriptPolicyInit {
  /** Path to the policy module (https, jsr, file, etc) */
  path: string;
  mode: 'script';
}

interface EventPolicyInit {
  mode: 'event';
}

type PolicyInit = PolicyInitCommon & (ScriptPolicyInit | EventPolicyInit);

export class CustomPolicy implements NPolicy {
  private policy: NPolicy = new ReadOnlyPolicy();

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

    const store = new DittoPgStore({
      db,
      conf,
      timeout: 5_000,
    });

    if (opts.mode === 'script') {
      const Policy = (await import(opts.path)).default;
      this.policy = new Policy({ db, store, pubkey });
    } else {
      const registry = new PolicyRegistry({ store, antiDuplicationPolicyStore: await Deno.openKv() });
      const policies: NPolicy[] = [];
      const event = await store
        .query([{ kinds: [11984], authors: [await conf.signer.getPublicKey()] }])
        .then((results) => results[0]);

      const spec: PolicySpec = event ? JSON.parse(event.content) : DEFAULT_POLICY_SPEC;

      for (const item of spec.policies) {
        const policy = registry.available[item.name];
        if (!policy) continue;
        policies.push(policy.instantiate(item.params || {}));
      }

      this.policy = new PipePolicy(policies);
    }
  }
}

Comlink.expose(new CustomPolicy());
