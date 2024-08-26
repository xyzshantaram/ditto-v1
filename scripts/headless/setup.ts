import { generateSecretKey, nip19 } from 'nostr-tools';
import { parseUploaderConfig } from './uploader-config.ts';

function scream(...args: any[]) {
  console.error('FATAL:', ...args);
  Deno.exit(1);
}

function missingEnv(what: string, v: string) {
  scream(`${what} not set! Set the ${v} config variable before trying again.`);
}

if (import.meta.main) {
  const key = generateSecretKey();
  const DITTO_NSEC = nip19.nsecEncode(key);
  console.log('DITTO_NSEC: ', DITTO_NSEC);

  const LOCAL_DOMAIN = Deno.env.get('DITTO_DOMAIN');
  if (!LOCAL_DOMAIN) missingEnv('Domain value', 'DITTO_DOMAIN');

  const uploaderConfig = Deno.env.get('DITTO_UPLOADER_CONFIG');
  if (!uploaderConfig) missingEnv('Uploader configuration', 'DITTO_UPLOADER_CONFIG');

  let uploader: ReturnType<typeof parseUploaderConfig>;
  try {
    uploader = parseUploaderConfig(uploaderConfig!);
  } catch (e) {
    scream('Error decoding uploader config:', e.message || e.toString());
  }

  const vars = {
    LOCAL_DOMAIN,
    DITTO_NSEC,
    ...uploader!,
  };

  const result = Object.entries(vars)
    .reduce((acc, [key, value]) => value ? `${acc}${key}="${value}"\n` : acc, '');

  await Deno.writeTextFile('./.env', result);
}
