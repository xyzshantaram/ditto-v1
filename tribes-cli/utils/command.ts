import { Option, ParsedArgs } from './mod.ts';

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

  get subcommandCount() {
    return Object.keys(this.commands).length;
  }

  isValidSubcommand(key: string): boolean {
    return Object.keys(this.commands).includes(key.toString());
  }

  getSubcommand(subcommand: string | number) {
    if (!subcommand) {
      throw new Error('tribes-cli: error: invalid subcommand');
    }
    if (typeof subcommand === 'number') {
      throw new Error('tribes-cli: error: subcommand cannot be a number');
    }

    if (this.isValidSubcommand(subcommand)) {
      return this.commands[subcommand];
    } else {
      throw new Error(`tribes-cli: error: ${subcommand} is not a valid subcommand`);
    }
  }

  setAction(action: Command['action']) {
    this.action = action;
    return this;
  }

  subcommand(name: string, command: Command) {
    if (this.isValidSubcommand(name)) {
      throw new Error(`tribes-cli: error: ${name} is already a subcommand.`);
    }
    this.commands[name] = command;
    return this;
  }

  option(fmt: string, option: Option) {
    this.options[fmt] = option;
    return this;
  }
}
