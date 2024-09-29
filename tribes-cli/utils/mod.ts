import { ParsedArgs } from './parsing.ts';
import { Command } from './command.ts';
import { defaultIdentityFile } from './ssh/identity.ts';
import { connect } from './ssh/mod.ts';

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

export { Command, connect, defaultIdentityFile };
export type { ParsedArgs };
