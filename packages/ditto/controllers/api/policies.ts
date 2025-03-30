import { type AppController } from '@/app.ts';
import { DEFAULT_POLICY_SPEC, policyRegistry } from "@/utils/policies.ts";

export const adminListPoliciesController: AppController = (c) => {
    return c.json(Object.entries(policyRegistry.available)
        .map(([internalName, item]) => {
            return {
                internalName,
                ...item,
                instantiate: undefined,
            }
        }))
};

export const adminCurrentPolicyController: AppController = async (c) => {
    const { relay, conf } = c.var;
    const pubkey = await conf.signer.getPublicKey();

    const current = await relay.query([{
        authors: [pubkey],
        kinds: [11984]
    }]).then(events => events[0]);

    if (current) return c.json({ mode: conf.policyMode, spec: current });
    return c.json({ mode: conf.policyMode, spec: DEFAULT_POLICY_SPEC });
}
