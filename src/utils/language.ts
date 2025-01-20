import ISO6391, { type LanguageCode } from 'iso-639-1';
import lande from 'lande';
import linkify from 'linkifyjs';
import { Conf } from '@/config.ts';

declare class LinguaDetector {
  private worker: Worker;
  private pending: Map<string, PromiseWithResolvers<Map<string, number>>>;
  destroyed: boolean;

  /**
   * Instantiate a new LanguageDetector.
   * @param workerPath Path to the worker file. If not supplied, it defaults to using the lingua-wasm build present with this package.
   * The worker is simply posted messages with a detection id and the string to detect. It must then respond with the same detection id and the detected language (or undefined.)
   */
  constructor(workerPath?: string);

  /**
   * Detect the language of a string.
   * @param str The string to detect for.
   * @returns A Promise that resolves to an ISO-639-3 language code.
   */
  detect(str: string): Promise<string>;

  /**
   * Checks if the LanguageDetector has been destroyed.
   * @throws Error if the detector has been destroyed.
   */
  private checkDestroyed(): void;

  /**
   * Destroys the LanguageDetector instance and terminates the associated Worker.
   */
  destroy(): void;
}

const toLanguageCode = (iso6393: string) => {
  const locale = new Intl.Locale(iso6393);
  if (ISO6391.validate(locale.language)) return locale.language as LanguageCode;
};

function detectWithLande(sanitized: string, threshold: number) {
  const [topResult] = lande(sanitized);
  if (topResult) {
    const [iso6393, confidence] = topResult;

    if (confidence >= threshold) {
      return toLanguageCode(iso6393);
    }
  }
}

const linguaDirUrl = (file: string) => {
  const normalized = new URL('../../data/lingua/' + file, import.meta.url);
  return normalized.toString();
};

let linguaInstance: LinguaDetector | undefined = undefined;

async function detectWithLingua(text: string) {
  try {
    if (!linguaInstance) {
      const { LanguageDetector } = await import(linguaDirUrl('mod.ts'));
      linguaInstance = new LanguageDetector(linguaDirUrl('src/worker.js')) as unknown as LinguaDetector;
      globalThis.addEventListener('unload', () => linguaInstance?.destroy());
    }
    const result = await linguaInstance.detect(text);
    return toLanguageCode(result);
  } catch (e) {
    console.error(e);
    return null;
  }
}

linkify.registerCustomProtocol('nostr', true);

/** Returns the detected language if the confidence is greater or equal than 'minConfidence'
 * 'minConfidence' must be a number between 0 and 1, such as 0.95
 */
export async function detectLanguage(text: string, threshold: number): Promise<LanguageCode | undefined> {
  // It's better to remove the emojis first
  const sanitized = linkify.tokenize(
    text
      .replaceAll(/\p{Extended_Pictographic}/gu, '')
      .replaceAll(/[\s\uFEFF\u00A0\u200B-\u200D\u{0FE0E}]+/gu, ' '),
  ).reduce((acc, { t, v }) => t === 'text' ? acc + v : acc, '').trim();

  if (sanitized.length < 10) { // heuristics
    return;
  }

  if (Conf.languageDetector === 'lingua') {
    const detected = await detectWithLingua(sanitized);
    if (detected) return detected;
  }

  return detectWithLande(sanitized, threshold);
}
