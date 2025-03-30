import { type AppController } from '@/app.ts';
import { createPolicyEvent } from '@/utils/policies.ts';
import { DEFAULT_POLICY_SPEC, policyRegistry } from '@/utils/policies.ts';
import { z } from 'zod';

export const adminListPoliciesController: AppController = (c) => {
  return c.json(
    Object.entries(policyRegistry.available)
      .map(([internalName, item]) => {
        return {
          internalName,
          ...item,
          instantiate: undefined,
        };
      }),
  );
};

export const adminCurrentPolicyController: AppController = async (c) => {
  const { relay, conf } = c.var;
  const pubkey = await conf.signer.getPublicKey();

  const current = await relay.query([{
    authors: [pubkey],
    kinds: [11984],
  }]).then((events) => events[0]);

  if (current) return c.json({ mode: conf.policyMode, spec: current });
  return c.json({ mode: conf.policyMode, spec: DEFAULT_POLICY_SPEC });
};

const PolicySpecSchema = z.object({
  policies: z.array(z.object({
    name: z.string(),
    params: z.record(z.any()),
  })),
});

export const adminUpdatePolicyController: AppController = async (c) => {
  const { relay, conf } = c.var;
  if (conf.policyMode === 'script') {
    return c.json({
      error:
        "The Ditto policy mode is set to 'script'. You will not be able to use the Policy UI until you change it to 'event'.",
    });
  }
  const req = await c.req.json();
  const parsed = PolicySpecSchema.parse(req);
  await relay.event(await createPolicyEvent(conf, parsed));
  return c.json({
    message: 'Settings saved successfully.',
  });
};
