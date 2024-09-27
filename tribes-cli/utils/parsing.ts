import { cleanArg, Command } from './mod.ts';
export type ParsedArgs = ReturnType<Command['parse']>['parsed'];

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

export const parseSubcommand = (command: Command, existing?: Partial<ParsedSubcommand>): ParsedSubcommand => {
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
