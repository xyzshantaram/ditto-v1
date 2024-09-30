import { NodeSSH } from 'node-ssh';

const commands = {
  DOKKU_SET_ADMIN_PUBKEY(identity: string) {
    return `bash -c "echo \\"${identity}\\" | dokku ssh-keys:add admin"`;
  },
  DOKKU_INSTALL_PLUGIN(plugin: string, opts: { source: 'dokku' | 'custom' } = { source: 'dokku' }) {
    if (opts.source === 'dokku') {
      return `dokku plugin:install https://github.com/dokku/${plugin}.git`;
    }
    return `dokku plugin:install ${plugin}`;
  },
  DOKKU_CREATE_POSTGRES_SERVICE(name: string) {
    return `dokku postgres:create ${name}`;
  },
  DOKKU_SET_GLOBAL_DOMAIN(domain: string) {
    return `dokku domains:set-global "${domain}"`;
  },
  DOKKU_LETSENCRYPT_SETUP_EMAIL(email: string) {
    return `dokku letsencrypt:set --global email "${email}"`;
  },
  DOKKU_LETSENCRYPT_CRON() {
    return 'dokku letsencrypt:cron-job --add';
  },
};

const tribesClient = (ssh: NodeSSH) => ({
  /**
   * Execute a command on the Tribes remote, storing the output for use. Throws an error with stderr if the exit code was nonzero.
   * @param name The name of the command to execute.
   * @param args The args for the command.
   * @returns The standard output of the command.
   */
  async action<K extends keyof typeof commands>(name: K, ...args: Parameters<typeof commands[K]>) {
    const cmd = commands[name];
    // @ts-ignore this is okay because typescript enforces the correct args at the callsite
    const res = await ssh.execCommand(cmd(...args));
    if (res.code) throw new Error(`Error executing ${name}: ${res.stderr}`);
    return res.stdout;
  },
  /**
   * **L**oudly execute a command on the remote, printing the output after execution.
   * @param name The name of the command to execute.
   * @param args The args for the command.
   * @returns The standard output of the command.
   */
  async actionL<K extends keyof typeof commands>(name: K, ...args: Parameters<typeof commands[K]>) {
    const stdout = await this.action(name, ...args);
    console.log(stdout);
  },
});

const ssh = new NodeSSH();
export const connect = async (host: string, identityFile: string) => {
  if (ssh.isConnected() && ssh.connection?.host === host) return tribesClient(ssh);
  await ssh.connect({
    host,
    username: 'root',
    privateKeyPath: identityFile,
  });
  return tribesClient(ssh);
};
