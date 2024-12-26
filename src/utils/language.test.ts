import { detectLanguage } from '@/utils/language.ts';
import { assertEquals, assertNotEquals } from '@std/assert';
import { Conf } from '@/config.ts';

Deno.test('Tests for language detection', async (t) => {
  await t.step('Empty string should return undefined', async () => {
    assertEquals(await detectLanguage(``, 0.90), undefined);
  });

  await t.step('Regular English string should be detected', async () => {
    assertEquals(await detectLanguage(`Good morning my fellow friends`, 0.90), 'en');
  });

  await t.step('nostr event id should be ignored', async () => {
    assertEquals(
      await detectLanguage(
        `Would you listen to Michael Jackson's songs?\n\nnostr:nevent1qvzqqqqqqypzqprpljlvcnpnw3pejvkkhrc3y6wvmd7vjuad0fg2ud3dky66gaxaqyvhwumn8ghj7cm0vfexzen4d4sjucm0d5hhyetvv9usqg8htx8xcjq7ffrzxu7nrhlr8vljcv6gpmet0auy87mpj6djxk4myqha02kp`,
        0.90,
      ),
      'en',
    );
  });

  await t.step('URLs should be ignored', async () => {
    assertEquals(
      await detectLanguage(
        `https://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_uhttps://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_uhttps://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_uhttps://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_uWould you listen to Michael Jackson's songs?\n\nnostr:nevent1qvzqqqqqqypzqprpljlvcnpnw3pejvkkhrc3y6wvmd7vjuad0fg2ud3dky66gaxaqyvhwumn8ghj7cm0vfexzen4d4sjucm0d5hhyetvv9usqg8htx8xcjq7ffrzxu7nrhlr8vljcv6gpmet0auy87mpj6djxk4myqha02kp`,
        0.90,
      ),
      'en',
    );
  });

  await t.step('Emoji should be ignored', async () => {
    assertEquals(
      await detectLanguage(
        `https://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_u 😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎    https://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_uhttps://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_uhttps://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_u Would you listen to Michael Jackson's songs?\n\nnostr:nevent1qvzqqqqqqypzqprpljlvcnpnw3pejvkkhrc3y6wvmd7vjuad0fg2ud3dky66gaxaqyvhwumn8ghj7cm0vfexzen4d4sjucm0d5hhyetvv9usqg8htx8xcjq7ffrzxu7nrhlr8vljcv6gpmet0auy87mpj6djxk4myqha02kp`,
        0.90,
      ),
      'en',
    );
  });

  await t.step('The horrific problem sentence', async () => {
    const tester = Conf.languageDetector === 'lingua' ? assertEquals : assertNotEquals;
    tester(await detectLanguage(`It may die when I die, and that's okay. It's my earnings.`, 0.90), 'en');
  });
  //
  await t.step('Should detect Hindi sentences', async () => {
    assertEquals(await detectLanguage(`मै डिट्टो की नयी अनुवाद सुविधा को आज़मा रहा हूँ`, 0.80), 'hi');
  });
});
