import { Command, connect } from '../utils/mod.ts';

export const init = new Command('init', 'Initialise a brand-new Ditto remote')
  .option('-e --email', {
    description: "The e-mail address to use for requesting Let's Encrypt certificates.",
  })
  .setAction(async (args) => {
    const arg = (name: string) => args[name] as string;
    const domain = args._[0] as string;
    const tribes = await connect(domain, arg('identity-file'));
    await tribes.actionL('DOKKU_SET_ADMIN_PUBKEY', await Deno.readTextFile(arg('identity-file')));
    await tribes.actionL('DOKKU_INSTALL_PLUGIN', 'postgres');
    await tribes.actionL('DOKKU_INSTALL_PLUGIN', 'letsencrypt');
    await tribes.actionL('DOKKU_CREATE_POSTGRES_SERVICE', 'dittodb');
    await tribes.actionL('DOKKU_SET_GLOBAL_DOMAIN', domain);
    await tribes.actionL('DOKKU_LETSENCRYPT_SETUP_EMAIL', arg('email'));
    await tribes.actionL('DOKKU_LETSENCRYPT_CRON');
  });
