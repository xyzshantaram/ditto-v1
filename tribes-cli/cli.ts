import { tribe } from './tribe/mod.ts';
import { remote } from './remote/mod.ts';
import { Command, defaultIdentityFile } from './utils/mod.ts';

async function main() {
  const tribes = new Command('tribes-cli', 'Create and manage Ditto Tribes servers.')
    .subcommand(tribe)
    .subcommand(remote)
    .option('-i --identity-file', {
      description: 'The ssh identity file to use. Defaults to ~/.ssh/id_rsa.',
      default: await defaultIdentityFile(),
    });

  const { parsed } = tribes.parse(Deno.args);
  const [s, v] = parsed._.slice(1);

  let cmd = tribes;
  if (s) cmd = tribes.getSubcommand(s);
  if (v) cmd = cmd.getSubcommand(v);

  await cmd.action(parsed);
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    console.error('ERROR:', e.message);
    Deno.exit(1);
  }
}
