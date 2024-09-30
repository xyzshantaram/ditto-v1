import { generateSecretKey, nip19 } from 'nostr-tools';
import { Command, makeSshAction } from '../utils/mod.ts';
import question from 'question-deno';
import { Conf } from '@/config.ts';

export const create = new Command('new', 'Create a new tribe.')
  .option('-c --custom-domain', {
    description: 'Do not use a subdomain of the tribes server; instead, use a custom domain.',
  })
  .option('-s --subdomain', {
    description: 'Use a subdomain of the tribes server to host the new Ditto instance.',
  })
  .option('-N --nsec', {
    description: 'The nsec to use for the Ditto instance. Will be generated if not present.',
  })
  .setAction(makeSshAction(async ({ tribes, arg, domain: host }) => {
    if (!arg('custom-domain') && !arg('subdomain')) {
      throw new Error('tribes-cli: No domain provided for tribes instance!');
    }

    const instance = arg('subdomain') || arg('custom-domain');
    const domain = arg('subdomain') ? `${arg('subdomain')}.${host}` : arg('custom-domain');

    let nsec = arg('nsec');
    if (!nsec) {
      const pkey = generateSecretKey();
      nsec = nip19.nsecEncode(pkey);
      console.log('nsec not supplied - generated it.');
      console.log('The nsec for the new Ditto instance is:');
      console.log(`\n${nsec}\n`);
      console.log(`Note this down now! You will not see it again.`);
      confirm('Press Enter to continue.');
    }

    console.log('Configuring uploader.');
    const uploader = await question('list', 'How should this server upload files?', [
      'nostrbuild',
      'blossom',
      's3',
      'ipfs',
    ]);

    if (!uploader) throw new Error('tribes-cli: uploader not set');

    const uploaderCfg: Record<string, string | undefined> = {};
    if (uploader === 'nostrbuild') {
      uploaderCfg.NOSTRBUILD_ENDPOINT = await question('input', 'nostr.build endpoint', Conf.nostrbuildEndpoint);
    }
    if (uploader === 'blossom') {
      uploaderCfg.BLOSSOM_SERVERS = await question(
        'input',
        'Blossom servers (comma separated)',
        Conf.blossomServers.join(','),
      );
    }
    if (uploader === 's3') {
      uploaderCfg.S3_ACCESS_KEY = await question('input', 'S3 access key', Conf.s3.accessKey);
      uploaderCfg.S3_SECRET_KEY = await question('input', 'S3 secret key', Conf.s3.secretKey);
      uploaderCfg.S3_ENDPOINT = await question('input', 'S3 endpoint', Conf.s3.endPoint);
      uploaderCfg.S3_BUCKET = await question('input', 'S3 bucket', Conf.s3.bucket);
      uploaderCfg.S3_REGION = await question('input', 'S3 region', Conf.s3.region);
      uploaderCfg.S3_PATH_STYLE = String(await question('confirm', 'Use path style?', Conf.s3.pathStyle ?? false));
      const mediaDomain = await question('input', 'Media domain', `media.${domain}`);
      uploaderCfg.MEDIA_DOMAIN = `https://${mediaDomain}`;
    }
    if (uploader === 'ipfs') {
      uploaderCfg.IPFS_API_URL = await question('input', 'IPFS API URL', Conf.ipfs.apiUrl);
      const mediaDomain = await question('input', 'Media domain', `media.${domain}`);
      uploaderCfg.MEDIA_DOMAIN = `https://${mediaDomain}`;
    }

    await tribes.do('DOKKU_CREATE_APP', instance);
    await tribes.do('DOKKU_LINK_PG', instance, 'dittodb');
    await tribes.do('DOKKU_SET_CONFIG_VAR', instance, 'DITTO_UPLOADER', uploader);
    await tribes.do('DOKKU_SET_CONFIG_VAR', instance, 'DITTO_NSEC', nsec);
    await tribes.do('DOKKU_SET_CONFIG_VAR', instance, 'LOCAL_DOMAIN', `https://${domain}`);
    for (const [key, val] of Object.entries(uploaderCfg)) {
      await tribes.do('DOKKU_SET_CONFIG_VAR', instance, key, val || '');
    }

    await tribes.do('DOKKU_LOAD_GIT', instance, 'https://gitlab.com/soapbox-pub/ditto.git', 'ditto-as-a-service');
    await tribes.do('DOKKU_REBUILD', instance);
    await tribes.do('DOKKU_LE_ENABLE', instance);
  }));
