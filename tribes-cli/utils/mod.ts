import { getOptionName, ParsedArgs } from './parsing.ts';
import { Command } from './command.ts';
import { defaultIdentityFile } from './ssh/identity.ts';
import { makeSshAction, privkeyToPubkey } from './ssh/mod.ts';

export type Option =
  & { description: string; required?: true }
  & ({
    default?: string;
  } | {
    bool: true;
    default?: boolean;
  });

export const cleanArg = (arg: string) => {
  return arg.replace(/^--?/g, '');
};

export async function runLocally(cmd: string) {
  console.log(cmd);
  const command = new Deno.Command('bash', {
    args: ['-c', cmd],
  });

  return command.output();
}

export { Command, defaultIdentityFile, getOptionName, makeSshAction, privkeyToPubkey };
export type { ParsedArgs };
