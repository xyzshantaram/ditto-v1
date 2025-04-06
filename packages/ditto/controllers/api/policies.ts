import { type AppController } from '@/app.ts';
import { createPolicyEvent } from '@/utils/policies/mod.ts';
import { DEFAULT_POLICY_SPEC, policyRegistry } from '@/utils/policies/mod.ts';
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

  if (current) return c.json({ mode: conf.policyMode, spec: JSON.parse(current.content) });

  await relay.event(await createPolicyEvent(conf, DEFAULT_POLICY_SPEC));
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

  try {
    const req = await c.req.json();
    const parsed = PolicySpecSchema.parse(req);

    // Validate each policy against its specific schema
    const invalidPolicies = parsed.policies.filter((policy) => {
      const policyItem = policyRegistry.available[policy.name];
      // If policy not found in registry, it's invalid
      if (!policyItem) {
        return true;
      }

      try {
        // Try to parse the policy params against the specific schema
        policyItem.schema.parse(policy.params);
        return false; // Not invalid
      } catch (_) {
        return true; // Invalid policy
      }
    });

    // If any policies are invalid, return an error
    if (invalidPolicies.length > 0) {
      return c.json({
        error: `Invalid policy specification for: ${invalidPolicies.map((p) => p.name).join(', ')}`,
      }, 400);
    }

    await relay.event(await createPolicyEvent(conf, parsed));
    return c.json({
      message: 'Settings saved successfully.',
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return c.json({ error: 'Invalid JSON in request body' }, 400);
    }
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid policy specification', details: error.errors }, 400);
    }
    return c.json({ error: 'Failed to update policy' }, 500);
  }
};
