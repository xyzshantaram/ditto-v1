import { Hono } from '@hono/hono';

import type { DittoEnv } from './DittoEnv.ts';

export class DittoApp extends Hono<DittoEnv> {
  // @ts-ignore Require a DittoRoute for type safety.
  declare route: (path: string, app: Hono<DittoEnv>) => Hono<DittoEnv>;
}
