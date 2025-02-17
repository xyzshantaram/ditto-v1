import { Hono } from '@hono/hono';

import { DittoApp } from './DittoApp.ts';
import { DittoRoute } from './DittoRoute.ts';

Deno.test('DittoApp', () => {
  const app = new DittoApp();

  const hono = new Hono();
  const route = new DittoRoute();

  app.route('/', route);

  // @ts-expect-error Passing a non-DittoRoute to route.
  app.route('/', hono);
});
