import { HTTPException } from '@hono/hono/http-exception';
import { NostrEvent } from '@nostrify/nostrify';

import { type AppContext, type AppMiddleware } from '@/app.ts';
import { localRequest } from '../../utils/api.ts';
import { buildAuthEventTemplate, type ParseAuthRequestOpts, validateAuthEvent } from '../../utils/nip98.ts';

type UserRole = 'user' | 'admin';

/** Require the user to prove their role before invoking the controller. */
function requireRole(role: UserRole, opts?: ParseAuthRequestOpts): AppMiddleware {
  return withProof(async (c, proof, next) => {
    const { conf, store } = c.var;

    const [user] = await store.query([{
      kinds: [30382],
      authors: [conf.pubkey],
      '#d': [proof.pubkey],
      limit: 1,
    }]);

    if (user && matchesRole(user, role)) {
      await next();
    } else {
      throw new HTTPException(401);
    }
  }, opts);
}

/** Require the user to demonstrate they own the pubkey by signing an event. */
function requireProof(opts?: ParseAuthRequestOpts): AppMiddleware {
  return withProof(async (_c, _proof, next) => {
    await next();
  }, opts);
}

/** Check whether the user fulfills the role. */
function matchesRole(user: NostrEvent, role: UserRole): boolean {
  return user.tags.some(([tag, value]) => tag === 'n' && value === role);
}

/** HOC to obtain proof in middleware. */
function withProof(
  handler: (c: AppContext, proof: NostrEvent, next: () => Promise<void>) => Promise<void>,
  opts?: ParseAuthRequestOpts,
): AppMiddleware {
  return async (c, next) => {
    const proof = await obtainProof(c, opts);
    if (proof) {
      await handler(c, proof, next);
    } else {
      throw new HTTPException(401, { message: 'No proof' });
    }
  };
}

/** Get the proof over Nostr Connect. */
async function obtainProof(c: AppContext, opts?: ParseAuthRequestOpts) {
  const { user } = c.var;

  if (!user) {
    throw new HTTPException(401, {
      res: c.json({ error: 'No way to sign Nostr event' }, 401),
    });
  }

  const req = localRequest(c);
  const reqEvent = await buildAuthEventTemplate(req, opts);
  const resEvent = await user.signer.signEvent(reqEvent);
  const result = await validateAuthEvent(req, resEvent, opts);

  if (result.success) {
    return result.data;
  }
}

export { requireProof, requireRole };
