import { assertEquals, assertThrows } from '@std/assert';

import { booleanParamSchema } from './schema.ts';

Deno.test('booleanParamSchema', () => {
  assertEquals(booleanParamSchema.parse('true'), true);
  assertEquals(booleanParamSchema.parse('false'), false);

  assertThrows(() => booleanParamSchema.parse('invalid'));
  assertThrows(() => booleanParamSchema.parse('undefined'));

  assertEquals(booleanParamSchema.optional().parse(undefined), undefined);
});
