import { Command, makeSshAction, privkeyToPubkey } from '../utils/mod.ts';

export const init = new Command('init', 'Initialise a brand-new Ditto remote')
  .option('-e --email', {
    description: "The e-mail address to use for requesting Let's Encrypt certificates.",
    required: true,
  })
  .setAction(makeSshAction(async ({ arg, tribes, domain }) => {
    const pubkey = await privkeyToPubkey(arg('identity-file'));
    await tribes.do('DOKKU_SET_ADMIN_PUBKEY', pubkey);
    await tribes.do('DOKKU_INSTALL_PLUGIN', 'postgres');
    await tribes.do('DOKKU_INSTALL_PLUGIN', 'letsencrypt');
    await tribes.do('DOKKU_CREATE_POSTGRES_SERVICE', 'dittodb');
    await tribes.do('DOKKU_SET_GLOBAL_DOMAIN', domain);
    await tribes.do('DOKKU_LETSENCRYPT_SETUP_EMAIL', arg('email'));
    await tribes.do('DOKKU_LETSENCRYPT_CRON');
  }));
