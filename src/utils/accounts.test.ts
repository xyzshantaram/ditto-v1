import { assertEquals } from '@std/assert';

import { sanitizeWebsite } from '@/utils/accounts.ts';

Deno.test('Sanitizes a URL to include an https prefix', () => {
  assertEquals(sanitizeWebsite('https://alexgleason.me/'), 'https://alexgleason.me/');
  assertEquals(sanitizeWebsite('http://alexgleason.me/'), 'http://alexgleason.me/');
  assertEquals(sanitizeWebsite('patrickdosreis.com'), 'https://patrickdosreis.com');
  // This is not a valid URL,
  // however, the URL() constructor does not check for top level domain
  // to prevent compatibility issues we'll allow this to pass as a URL
  assertEquals(sanitizeWebsite('açsldkjfasd'), 'https://açsldkjfasd');
  assertEquals(sanitizeWebsite('https/'), 'https://https/');
  assertEquals(sanitizeWebsite('----------'), 'https://----------');

  assertEquals(sanitizeWebsite('https'), 'https://https');
  assertEquals(sanitizeWebsite('https:/'), 'https://https:/');
  assertEquals(sanitizeWebsite('http://'), 'https://http://');
  assertEquals(sanitizeWebsite('http:/'), 'https://http:/');
  assertEquals(sanitizeWebsite('    '), undefined);
  assertEquals(sanitizeWebsite(undefined), undefined);
});
