import { Command, makeSshAction, privkeyToPubkey } from '../utils/mod.ts';

export const init = new Command('init', 'Initialise a brand-new Ditto remote')
  .option('-e --email', {
    description: "The e-mail address to use for requesting Let's Encrypt certificates.",
  })
  .setAction(makeSshAction(async ({ arg, tribes, domain }) => {
    const pubkey = await privkeyToPubkey(arg('identity-file'));
    await tribes.loud('DOKKU_SET_ADMIN_PUBKEY', pubkey);
    await tribes.loud('DOKKU_INSTALL_PLUGIN', 'postgres');
    await tribes.loud('DOKKU_INSTALL_PLUGIN', 'letsencrypt');
    await tribes.loud('DOKKU_CREATE_POSTGRES_SERVICE', 'dittodb');
    await tribes.loud('DOKKU_SET_GLOBAL_DOMAIN', domain);
    await tribes.loud('DOKKU_LETSENCRYPT_SETUP_EMAIL', arg('email'));
    await tribes.loud('DOKKU_LETSENCRYPT_CRON');
  }));
