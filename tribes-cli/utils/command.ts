import { Option, ParsedArgs } from './mod.ts';
import { parseArgs } from '@std/cli';
import { parseSubcommand } from './parsing.ts';

export class Command {
  name: string;
  description: string;
  action: (args: ParsedArgs) => void | Promise<void> = (_) => {};
  options: Record<string, Option> = {};
  commands: Record<string, Command> = {};

  constructor(name: string, description: string) {
    this.name = name;
    this.description = description;
  }

  isValidSubcommand(key: string): boolean {
    return Object.keys(this.commands).includes(key.toString());
  }

  getSubcommand(subcommand: string | number) {
    if (!subcommand) {
      throw new Error('tribes-cli: invalid subcommand');
    }
    if (typeof subcommand === 'number') {
      throw new Error('tribes-cli: subcommand cannot be a number');
    }

    if (this.isValidSubcommand(subcommand)) {
      return this.commands[subcommand];
    } else {
      throw new Error(`tribes-cli: ${subcommand} is not a valid subcommand`);
    }
  }

  setAction(action: Command['action']) {
    this.action = action;
    return this;
  }

  subcommand(command: Command) {
    if (this.isValidSubcommand(command.name)) {
      throw new Error(`tribes-cli: ${command.name} is already a subcommand.`);
    }
    this.commands[command.name] = command;
    return this;
  }

  option(fmt: string, option: Option) {
    this.options[fmt] = option;
    return this;
  }

  parse(args: string[]) {
    const parserArgs = parseSubcommand(this, {});
    const parsed = parseArgs(Deno.args, parserArgs);
    return { parsed, parserArgs };
  }
}
