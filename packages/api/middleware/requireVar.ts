import { HTTPException } from '@hono/hono/http-exception';

import type { SetRequired } from 'type-fest';
import type { DittoEnv } from '../DittoEnv.ts';
import type { DittoMiddleware } from '../DittoMiddleware.ts';

type DittoVars = DittoEnv['Variables'];

export function requireVar<K extends keyof DittoVars>(key: K): DittoMiddleware<SetRequired<DittoVars, K>> {
  return (c, next) => {
    if (!c.var[key]) {
      throw new HTTPException(500, { message: `Missing required variable: ${key}` });
    }

    return next();
  };
}
