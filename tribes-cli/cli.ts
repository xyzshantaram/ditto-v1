interface BaseArg {
  kind: 'string' | 'number' | 'bool';
  name: string;
  invert?: true;
}

type Argument = BaseArg & { optional?: true };
type Option = BaseArg & { short?: string };

interface BaseCommand {
  options: Option[];
  name: string;
}

type Command =
  | (
    & BaseCommand
    & ({
      arguments: Argument[];
    } | {
      subcommands: Command[];
    })
  )
  | BaseCommand;

interface ParseResult {
  [key: string]: boolean | string | number | ParseResult;
}

const parseArgs = (args: string[], config: Command) => {
  const result: ParseResult = {};

  let i = 0;
  const opt = (kind: BaseArg['kind'], idx: number) => kind === 'number' ? Number(args[idx]) : args[idx];
  const doOption = (cfg: Option, skip = -1, blockLength = -1) => {
    if (cfg.kind === 'number' || cfg.kind === 'string') {
      if (skip === -1) {
        result[cfg.name] = opt(cfg.kind, i + 1);
        i += 1;
      } else {
        result[cfg.name] = opt(cfg.kind, i + skip);
        if (skip === blockLength) {
          i += skip;
        }
      }
    } else {
      result[cfg.name] = !cfg.invert;
    }
  };

  if ('arguments' in config && config.arguments.length) {
    const argumentCount = args.filter((arg) => !arg.startsWith('-')).length;
    const last = config.arguments.at(-1);
    const requiredCount = config.arguments.length - (last?.optional ? 1 : 0);
    if (argumentCount !== requiredCount) throw new Error('Invalid number of arguments passed!');
  }

  let argumentsParsed = 0;
  for (i; i < args.length; i++) {
    const current = args[i];
    if (current[0] === '-') {
      if (current.startsWith('--')) {
        const opt = current.slice(2);
        const cfg = config.options.find((o) => o.name === opt);
        if (!cfg) continue;
        doOption(cfg);
      } else {
        const block = current.slice(1).split('');
        for (let idx = 0; idx < block.length; idx++) {
          const cfg = config.options.find((o) => o.short === block[idx]);
          if (!cfg) continue;
          doOption(cfg, idx + 1, block.length);
        }
      }
    } else {
      if ('subcommands' in config) {
        const subcommand = config.subcommands.find((cmd) => cmd.name === current);
        if (subcommand) {
          result[subcommand.name] = parseArgs(args.slice(i + 1), subcommand);
        }
      } else if ('arguments' in config) {
        const arg = config.arguments[argumentsParsed++];
        if (arg.kind === 'bool') {
          if (args[i] !== 'true' && args[i] !== 'false') {
            throw new Error(`Non-boolean value passed for boolean argument ${arg.name}!`);
          }
          result[arg.name] = args[i] === 'true' ? true : false;
        } else if (arg.kind === 'string') {
          result[arg.name] = args[i];
        } else if (arg.kind === 'number') {
          result[arg.name] = Number(args[i]);
        }
      }
    }
  }
  return result;
};

/**
 * TODOs
 * - get instance list from dokku for pushing updates
 * - fix item duplication issues with colocated postgres
 * - make dokku work with existing postgres
 * - make new-tribe script work with custom domains
 * - get ssh key as -i argument
 * -
 */

const res = parseArgs(Deno.args, {
  name: 'tribes-cli',
  options: [{
    kind: 'string',
    name: 'identity-file',
    short: 'i',
  }],
  subcommands: [{
    name: 'tribe',
    options: [{
      name: 'alice',
      short: 'a',
      kind: 'number',
    }, {
      name: 'bob',
      short: 'b',
      kind: 'string',
    }, {
      name: 'charlie',
      short: 'c',
      kind: 'number',
    }],
    subcommands: [{
      name: 'new',
      arguments: [{
        name: 'name',
        kind: 'string',
      }],
      options: [],
    }],
  }],
});

console.log(res);

Deno.exit(1);
/*
if (import.meta.main) {
  const tribes =
    new Command('tribes-cli')
      .description('CLI for managing Ditto Tribes instances.')
      .version("0.0.1")
      .option('-i --identity-file <string>', 'Path to the ssh identity file.', defaultIdentityFile())
      .action(async args => {
        if (!args.identityFile) {
          throw new InvalidArgumentError(`Invalid or missing identity file ${args.identityFile || '<empty string>'}`);
        }
        try {
          console.log(args.identityFile);
          const file = await Deno.readTextFile(args.identityFile);
          sessionStorage.setItem('identity', file);
          console.log(`Read identity file from ${args.identityFile} successfully.`);
        }
        catch (e) {
          throw new InvalidArgumentError(`Error reading identity file: ${e.message}`);
        }
      })
      .showHelpAfterError();

  [tribe, remote].forEach(cmd => tribes.addCommand(cmd));
  const foo = await tribes.parseAsync(Deno.args, { from: 'user' });
  console.log(foo);
}

*/
