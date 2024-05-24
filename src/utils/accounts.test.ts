import { assertEquals } from '@std/assert';

import { sanitizeWebsite } from '@/utils/accounts.ts';

type testSanatizeWbsite = {
  url: string | undefined;
  expectedOutput: string | undefined;
};

Deno.test('throws a RelayError when inserting an event deleted by a user', () => {
  const testCases: testSanatizeWbsite[] = [
    { url: 'https://alexgleason.me/', expectedOutput: 'https://alexgleason.me/' },
    { url: 'http://alexgleason.me/', expectedOutput: 'http://alexgleason.me/' },
    { url: 'patrickdosreis.com', expectedOutput: 'https://patrickdosreis.com' },

    // This is not a valid URL,
    // however, the URL() constructor does not check for top level domain
    // to prevent compatibility issues we'll allow this to pass as a URL
    { url: 'açsldkjfasd', expectedOutput: 'https://açsldkjfasd' },
    { url: 'https/', expectedOutput: 'https://https/' },
    { url: '----------', expectedOutput: 'https://----------' },

    { url: 'https', expectedOutput: undefined },
    { url: 'https://', expectedOutput: undefined },
    { url: 'https:/', expectedOutput: undefined },
    { url: 'http://', expectedOutput: undefined },
    { url: 'http:/', expectedOutput: undefined },
    { url: '    ', expectedOutput: undefined },
    { url: undefined, expectedOutput: undefined },
  ];

  for (const testCase of testCases) {
    assertEquals(sanitizeWebsite(testCase.url), testCase.expectedOutput);
  }
});
