import { policyRegistry } from '@/app.ts';
import { nostrNow } from '@/utils.ts';
import type { DittoConf } from "@ditto/conf";

type ParamValue = string | number | boolean;

interface PolicySpec {
    name: keyof typeof policyRegistry.policies;
    params?: Record<string, ParamValue | ParamValue[]>;
}

export const DEFAULT_POLICIES: PolicySpec[] = [
    { "name": "AntiDuplicationPolicy" },
    { "name": "AuthorPolicy" },
    { "name": "DomainPolicy" },
    { "name": "HellthreadPolicy" },
    { "name": "ReplyBotPolicy" },
    { "name": "SizePolicy" },
    { "name": "HashtagPolicy", "params": { "hashtags": ["NSFW", "explicit", "violence", "cp", "porn"] } },
];

export const createPolicyEvent = async (conf: DittoConf, policies: PolicySpec[]) => {
    return await conf.signer.signEvent({
        kind: 11984,
        content: JSON.stringify({ policies }),
        created_at: nostrNow(),
        tags: []
    })
}