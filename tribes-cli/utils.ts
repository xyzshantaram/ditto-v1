import { join } from '@std/path';

let identity = '';
export const defaultIdentityFile = async () => {
  if (!identity) {
    const home = Deno.env.get('HOME');
    if (home) return identity = await Deno.readTextFile(join(home, '.ssh', 'id_rsa'));
  }
  return '';
};

export interface Subcommand {
  action: Function;
  description: string;
  options?: Record<
    string,
    & { description: string }
    & ({
      default?: string;
    } | {
      bool: true;
      default?: boolean;
    })
  >;
  commands?: Record<string, Subcommand>;
}

export const cleanArg = (arg: string) => {
  return arg.replace(/^--?/g, '');
};

export interface ParsedSubcommand {
  string: string[];
  boolean: string[];
  alias: Record<string, string[]>;
  default: Record<string, string | boolean>;
}

export const defaultParsedSubcommand = (): ParsedSubcommand => {
  return {
    string: [],
    boolean: [],
    alias: {},
    default: {},
  };
};

export const parseSubcommand = (command: Subcommand, existing?: Partial<ParsedSubcommand>): ParsedSubcommand => {
  const res = Object.assign(defaultParsedSubcommand(), existing);

  if (command.options) {
    for (const option in command.options) {
      const split = option.split(' ').toSorted((a, b) => b.length - a.length).map(cleanArg);
      const name = split[0];
      const body = command.options[option];
      if ('bool' in body) {
        res.boolean.push(name);
      } else {
        res.string.push(name);
      }
      res.alias[name] = split;
    }
  }

  if (command.commands) {
    for (const subcommand in command.commands) {
      const parsed = parseSubcommand(command.commands[subcommand]);
      Object.assign(res.alias, parsed.alias);
      Object.assign(res.default, parsed.default);
      res.boolean.push(...parsed.boolean);
      res.string.push(...parsed.string);
    }
  }

  return res;
};
