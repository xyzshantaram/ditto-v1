import { parseArgs } from '@std/cli';
import { tribe } from './tribe/mod.ts';
import { remote } from './remote/mod.ts';
import { ParsedSubcommand, parseSubcommand } from './utils.ts';

const commands = {
  tribe,
  remote,
};

let parserArgs: Partial<ParsedSubcommand> = {
  string: ['identity-file'],
};

for (const [_name, body] of Object.entries(commands)) {
  for (const subcommand in body) {
    const s = body[subcommand];
    parserArgs = parseSubcommand(s, parserArgs);
  }

  // TODO: construct a help string here
}

console.log(parserArgs);
