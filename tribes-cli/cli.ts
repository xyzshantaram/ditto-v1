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

const parsed = parseArgs(Deno.args, parserArgs);
console.log(parserArgs);
console.log(parsed);

const [subcommand, verb] = parsed._;

const isValidSubcommand = (key: string): key is keyof typeof commands => {
  return Object.keys(commands).includes(key.toString());
};

if (typeof subcommand === 'number') {
  console.error('Error: subcommand cannot be a number');
  Deno.exit(1);
}

if (!subcommand) {
  // todo: output help, probably
} else if (subcommand && !verb) {
  // todo: output help only for specific subcommand
} else {
  if (isValidSubcommand(subcommand)) {
    console.log(commands[subcommand]);
  } else {
    console.error(`Error: ${subcommand} is not a valid subcommand`);
    Deno.exit(1);
  }
}
