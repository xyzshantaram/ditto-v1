import { base64 } from '@scure/base';
import { z } from 'zod';
import { Conf } from '@/config.ts';
import question from 'question-deno';

const s3Schema = z.object({
  DITTO_UPLOADER: z.literal('s3'),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_ENDPOINT: z.string().url(),
  S3_BUCKET: z.string(),
  S3_REGION: z.string(),
  S3_PATH_STYLE: z.union([z.literal('true'), z.literal('false')]),
  MEDIA_DOMAIN: z.string().url(),
});

const blossomSchema = z.object({
  DITTO_UPLOADER: z.literal('blossom'),
  BLOSSOM_SERVERS: z.string().refine((value) => {
    return value.split(',').every((server) => {
      try {
        new URL(server);
        return true;
      } catch {
        return false;
      }
    });
  }, { message: 'All Blossom servers must be valid URLs' }),
});

const nostrBuildSchema = z.object({
  DITTO_UPLOADER: z.literal('nostrbuild'),
  NOSTRBUILD_ENDPOINT: z.string().url(),
});

const ipfsSchema = z.object({
  DITTO_UPLOADER: z.literal('ipfs'),
  IPFS_API_URL: z.string().url(),
  MEDIA_DOMAIN: z.string().url(),
});

const localSchema = z.object({
  DITTO_UPLOADER: z.literal('local'),
  UPLOADS_DIR: z.string().default(Conf.nostrbuildEndpoint),
  MEDIA_DOMAIN: z.string().url(),
});

const uploaderSchema = z.union([
  nostrBuildSchema,
  blossomSchema,
  s3Schema,
  ipfsSchema,
  localSchema,
]);

export function parseUploaderConfig(cfg: string) {
  const decoded = new TextDecoder().decode(base64.decode(cfg!));
  const parsed = JSON.parse(decoded);
  const validated = uploaderSchema.parse(parsed);
  return validated;
}

if (import.meta.main) {
  const vars: Record<string, string | undefined> = {};

  const [domain] = Deno.args;
  if (!domain) {
    throw new Error('Domain is required!');
  }

  if (!domain.match(/^(https?):\/\/.+/)) {
    throw new Error('Domain must begin with http(s)!');
  }

  vars.DITTO_UPLOADER = await question('list', 'How do you want to upload files?', [
    'nostrbuild',
    'blossom',
    's3',
    'ipfs',
    'local',
  ]);

  if (vars.DITTO_UPLOADER === 'nostrbuild') {
    vars.NOSTRBUILD_ENDPOINT = await question('input', 'nostr.build endpoint', Conf.nostrbuildEndpoint);
  }
  if (vars.DITTO_UPLOADER === 'blossom') {
    vars.BLOSSOM_SERVERS = await question('input', 'Blossom servers (comma separated)', Conf.blossomServers.join(','));
  }
  if (vars.DITTO_UPLOADER === 's3') {
    vars.S3_ACCESS_KEY = await question('input', 'S3 access key', Conf.s3.accessKey);
    vars.S3_SECRET_KEY = await question('input', 'S3 secret key', Conf.s3.secretKey);
    vars.S3_ENDPOINT = await question('input', 'S3 endpoint', Conf.s3.endPoint);
    vars.S3_BUCKET = await question('input', 'S3 bucket', Conf.s3.bucket);
    vars.S3_REGION = await question('input', 'S3 region', Conf.s3.region);
    vars.S3_PATH_STYLE = String(await question('confirm', 'Use path style?', Conf.s3.pathStyle ?? false));
    const mediaDomain = await question('input', 'Media domain', `media.${domain}`);
    vars.MEDIA_DOMAIN = `https://${mediaDomain}`;
  }
  if (vars.DITTO_UPLOADER === 'ipfs') {
    vars.IPFS_API_URL = await question('input', 'IPFS API URL', Conf.ipfs.apiUrl);
    const mediaDomain = await question('input', 'Media domain', `media.${domain}`);
    vars.MEDIA_DOMAIN = `https://${mediaDomain}`;
  }
  if (vars.DITTO_UPLOADER === 'local') {
    vars.UPLOADS_DIR = await question('input', 'Local uploads directory', Conf.uploadsDir);
    const mediaDomain = await question('input', 'Media domain', `media.${domain}`);
    vars.MEDIA_DOMAIN = `https://${mediaDomain}`;
  }

  const encoded = base64.encode(new TextEncoder().encode(JSON.stringify(vars)));
  console.log(encoded);
}
