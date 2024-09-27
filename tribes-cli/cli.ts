import { tribe } from './tribe/mod.ts';
import { remote } from './remote/mod.ts';
import { Command, defaultIdentityFile, setupCli } from './utils/mod.ts';

async function main() {
  const tribes = new Command('tribes-cli', 'Create and manage Ditto Tribes servers.')
    .subcommand('tribe', tribe)
    .subcommand('remote', remote);

  const { parsed } = setupCli(tribes, {
    string: ['identity-file'],
    default: {
      'identity-file': await defaultIdentityFile(),
    },
  });

  const [s, v] = parsed._;

  let cmd = tribes;
  if (s && !v) {
    cmd = tribes.getSubcommand(s);
  } else if (s && v) {
    cmd = tribes.getSubcommand(s).getSubcommand(v);
  }

  await cmd.action(parsed);
}

if (import.meta.main) {
  await main();
}
