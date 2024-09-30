import { NodeSSH } from 'node-ssh';
import { ParsedArgs, runLocally } from '../mod.ts';

const commands = {
  DOKKU_SET_ADMIN_PUBKEY(identity: string) {
    return `bash -c "echo \\"${identity}\\" | dokku ssh-keys:add admin"`;
  },
  DOKKU_INSTALL_PLUGIN(plugin: string, opts: { source: 'dokku' | 'custom' } = { source: 'dokku' }) {
    if (opts.source === 'dokku') {
      return `dokku plugin:install https://github.com/dokku/dokku-${plugin}.git`;
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

class TribesClient {
  ssh: NodeSSH;
  constructor(ssh: NodeSSH) {
    this.ssh = ssh;
  }
  /**
   * Execute a command on the Tribes remote, storing the output for use. Throws an error with stderr if the exit code was nonzero.
   * @param name The name of the command to execute.
   * @param args The args for the command.
   * @returns The standard output of the command.
   */
  async do<K extends keyof typeof commands>(name: K, ...args: Parameters<typeof commands[K]>) {
    const cmd = commands[name];
    // @ts-ignore this is okay because typescript enforces the correct args at the callsite
    const res = await this.ssh.execCommand(cmd(...args));
    if (res.code) throw new Error(`Error executing ${name}: ${res.stderr}`);
    console.error(res);
    return res.stdout;
  }
  /**
   * Execute a command on the remote, printing the output after execution.
   * @param name The name of the command to execute.
   * @param args The args for the command.
   * @returns The standard output of the command.
   */
  async loud<K extends keyof typeof commands>(name: K, ...args: Parameters<typeof commands[K]>) {
    const stdout = await this.do(name, ...args);
    console.log(stdout);
  }
}

interface HandlerOptions {
  args: ParsedArgs;
  arg: (name: string) => string;
  tribes: TribesClient;
  domain: string;
}

export const makeSshAction = (handler: (opts: HandlerOptions) => Promise<void> | void) => {
  return async (args: ParsedArgs) => {
    const arg = (name: string) => args[name] as string;
    const domain = args._[0] as string;
    const tribes = await connect(domain, arg('identity-file'));
    handler({ args, arg, tribes, domain });
  };
};

const ssh = new NodeSSH();
const connect = async (host: string, identityFile: string) => {
  if (ssh.isConnected() && ssh.connection?.host === host) return new TribesClient(ssh);
  await ssh.connect({
    host,
    username: 'root',
    privateKeyPath: identityFile,
  });
  return new TribesClient(ssh);
};

export const privkeyToPubkey = async (path: string) => {
  const result = await runLocally(`ssh-keygen -y -f ${path}`);
  const decoder = new TextDecoder();
  if (result.code) {
    throw new Error(
      `tribes-cli: error generating public key from private key ${path}:` + ` ${decoder.decode(result.stderr)}`,
    );
  }
  return decoder.decode(result.stdout);
};
