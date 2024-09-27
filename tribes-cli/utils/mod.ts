import { join } from '@std/path';
import { ParsedArgs, setupCli } from './parsing.ts';
import { Command } from './command.ts';

export const defaultIdentityFile = async () => {
  const home = Deno.env.get('HOME');
  if (!home) throw new Error('tribes-cli: unable to find default identity file');
  const path = join(home, '.ssh', 'id_rsa');
  try {
    await Deno.stat(path);
    return path;
  } catch {}

  throw new Error('tribes-cli: unable to find default identity file.');
};

export type Option =
  & { description: string }
  & ({
    default?: string;
  } | {
    bool: true;
    default?: boolean;
  });

export const cleanArg = (arg: string) => {
  return arg.replace(/^--?/g, '');
};

export { Command, setupCli };
export type { ParsedArgs };
