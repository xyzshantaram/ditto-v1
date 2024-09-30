import { Option, ParsedArgs } from './mod.ts';
import { parseArgs } from '@std/cli';
import { parseSubcommand } from './parsing.ts';

export class Command {
  name: string;
  description: string;
  private action: (args: ParsedArgs) => void | Promise<void> = (_) => {};
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

  async doAction(args: ParsedArgs) {
    if (args.help) {
      return console.log(this.help);
    }
    return await this.action(args);
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
    const parserArgs = parseSubcommand(this);
    const parsed = parseArgs(args, {
      ...parserArgs,
      alias: {
        'help': ['h'],
      },
      boolean: 'help',
    });
    return { parsed, parserArgs };
  }

  get usage(): string {
    const res = [`${this.name}`];
    const subcommands = Object.keys(this.commands);
    if (subcommands.length) {
      res.push(`<${subcommands.join('|')}>`);
    }
    return res.join(' ');
  }

  get help(): string {
    const lines = [
      `Usage: ${this.usage}`,
      '',
      `${this.description}`,
      '',
    ];

    if (Object.keys(this.options).length > 0) {
      lines.push('Options:');
      for (const [key, option] of Object.entries(this.options)) {
        lines.push(`  ${key}\t${option.description}`);
        if ('default' in option) {
          lines[lines.length - 1] += ` (default: ${option.default})`;
        }
      }
    }

    lines.push('');

    if (Object.keys(this.commands).length > 0) {
      lines.push('Options:');
      for (const [, command] of Object.entries(this.commands)) {
        lines.push(`${command.usage}\t${command.description}`);
      }
    }

    return lines.join('\n') + '\n';
  }
}
