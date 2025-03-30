import { nostrNow } from '@/utils.ts';
import type { DittoConf } from '@ditto/conf';
import { PolicyRegistry } from '@nostrify/policies';
import { MockRelay } from '@nostrify/nostrify/test';

type ParamValue = string | number | boolean;

export const policyRegistry = new PolicyRegistry({
  antiDuplicationPolicyStore: {
    get: (key: Deno.KvKey) => Promise.resolve({ key, value: null, versionstamp: null }),
    set: () => Promise.resolve({ ok: true, versionstamp: '00000000000000000000' }),
  },
  store: new MockRelay(),
});

interface PolicySpecItem {
  name: keyof typeof policyRegistry.available;
  params?: Record<string, ParamValue | ParamValue[]>;
}

export interface PolicySpec {
  policies: PolicySpecItem[];
}

export const DEFAULT_POLICY_SPEC: PolicySpec = {
  policies: [
    { 'name': 'AntiDuplicationPolicy' },
    { 'name': 'HellthreadPolicy' },
    { 'name': 'ReplyBotPolicy' },
    { 'name': 'SizePolicy' },
    { 'name': 'HashtagPolicy', 'params': { 'hashtags': ['NSFW', 'explicit', 'violence', 'cp', 'porn'] } },
  ],
};

export const createPolicyEvent = async (conf: DittoConf, policies: PolicySpec) => {
  return await conf.signer.signEvent({
    kind: 11984,
    content: JSON.stringify(policies),
    created_at: nostrNow(),
    tags: [],
  });
};
